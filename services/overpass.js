const OVERPASS_URLS = (process.env.OVERPASS_URLS || process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const OVERPASS_TIMEOUT_MS = Number(process.env.OVERPASS_TIMEOUT_MS || 7000);
const { getCitySearchArea } = require("../data/cities");
const OVERPASS_CACHE_TTL_MS = Number(process.env.OVERPASS_CACHE_TTL_MS || 5 * 60 * 1000);
const OVERPASS_REQUEST_GAP_MS = Number(process.env.OVERPASS_REQUEST_GAP_MS || 1100);
const overpassCache = new Map();
let nextOverpassRequestAt = 0;

const categoryQueries = {
  school: [
    'node["amenity"~"school|college|university|language_school|music_school|driving_school"]',
    'way["amenity"~"school|college|university|language_school|music_school|driving_school"]',
    'relation["amenity"~"school|college|university|language_school|music_school|driving_school"]',
    'node["office"="educational_institution"]',
    'way["office"="educational_institution"]',
    'relation["office"="educational_institution"]'
  ],
  office: [
    'node["office"~"company|employment_agency|coworking"]',
    'way["office"~"company|employment_agency|coworking"]',
    'relation["office"~"company|employment_agency|coworking"]'
  ],
  plumber: ['node["craft"="plumber"]', 'way["craft"="plumber"]', 'node["shop"="doityourself"]'],
  handyman: ['node["craft"="handyman"]', 'way["craft"="handyman"]', 'node["office"="handyman"]'],
  electrician: ['node["craft"="electrician"]', 'way["craft"="electrician"]'],
  cleaner: ['node["craft"="cleaning"]', 'way["craft"="cleaning"]'],
  photographer: ['node["craft"="photographer"]', 'way["craft"="photographer"]'],
  courier: ['node["amenity"="courier"]', 'way["amenity"="courier"]', 'node["office"="courier"]', 'way["office"="courier"]'],
  cafe: [
    'node["amenity"~"cafe|fast_food|restaurant"]',
    'way["amenity"~"cafe|fast_food|restaurant"]',
    'relation["amenity"~"cafe|fast_food|restaurant"]'
  ],
  coffee_shop: [
    'node["amenity"="cafe"]["cuisine"~"coffee|coffee_shop",i]',
    'way["amenity"="cafe"]["cuisine"~"coffee|coffee_shop",i]',
    'relation["amenity"="cafe"]["cuisine"~"coffee|coffee_shop",i]',
    'node["shop"~"coffee|coffee_shop"]',
    'way["shop"~"coffee|coffee_shop"]'
  ],
  grocery: [
    'node["shop"~"supermarket|convenience|grocery|greengrocer"]',
    'way["shop"~"supermarket|convenience|grocery|greengrocer"]',
    'relation["shop"~"supermarket|convenience|grocery|greengrocer"]'
  ],
  pharmacy: [
    'node["amenity"="pharmacy"]',
    'way["amenity"="pharmacy"]',
    'relation["amenity"="pharmacy"]',
    'node["shop"="chemist"]',
    'way["shop"="chemist"]'
  ],
  clinic: [
    'node["amenity"~"clinic|doctors|hospital"]',
    'way["amenity"~"clinic|doctors|hospital"]',
    'relation["amenity"~"clinic|doctors|hospital"]'
  ],
  entertainment: [
    'node["amenity"~"cinema|theatre|arts_centre"]',
    'way["amenity"~"cinema|theatre|arts_centre"]',
    'node["tourism"="museum"]',
    'way["tourism"="museum"]',
    'node["leisure"="bowling_alley"]',
    'way["leisure"="bowling_alley"]'
  ],
  restaurant: [
    'node["amenity"="restaurant"]',
    'way["amenity"="restaurant"]',
    'relation["amenity"="restaurant"]'
  ],
  bakery: [
    'node["shop"~"bakery|confectionery"]',
    'way["shop"~"bakery|confectionery"]'
  ],
  beauty_salon: [
    'node["shop"="beauty"]',
    'way["shop"="beauty"]'
  ],
  barbershop: [
    'node["shop"="hairdresser"]',
    'way["shop"="hairdresser"]'
  ],
  fitness: [
    'node["leisure"~"fitness_centre|sports_centre|gym"]',
    'way["leisure"~"fitness_centre|sports_centre|gym"]'
  ],
  clothing: [
    'node["shop"="clothes"]',
    'way["shop"="clothes"]'
  ],
  electronics: [
    'node["shop"="electronics"]',
    'way["shop"="electronics"]'
  ],
  auto_service: [
    'node["shop"~"car|car_repair|tyres"]',
    'way["shop"~"car|car_repair|tyres"]'
  ],
  childcare: [
    'node["amenity"~"kindergarten|childcare"]',
    'way["amenity"~"kindergarten|childcare"]'
  ],
  pet_store: [
    'node["shop"="pet"]',
    'way["shop"="pet"]'
  ],
  flowers: [
    'node["shop"="florist"]',
    'way["shop"="florist"]'
  ],
  coworking: [
    'node["office"="coworking"]',
    'way["office"="coworking"]'
  ]
};

async function fetchBusinessesFromOverpass({ city, businessType, businessTypes = null, center = null, radiusMeters = null }) {
  const configuredArea = getCitySearchArea(city);
  const searchArea = center && Number.isFinite(Number(center.lat)) && Number.isFinite(Number(center.lng))
    ? { lat: Number(center.lat), lng: Number(center.lng), radiusMeters: Math.max(500, Math.min(25000, Number(radiusMeters) || 10000)) }
    : configuredArea;
  const selectedTypes = Array.isArray(businessTypes) && businessTypes.length ? businessTypes : [businessType];
  const queryParts = selectedTypes.flatMap((type) => categoryQueries[normalizeKey(type)] || []);

  if (!searchArea || !queryParts) {
    return {
      businesses: [],
      source: buildSourceMeta({ status: "unsupported", city, businessType })
    };
  }

  const query = buildQuery({ searchArea, queryParts });
  const cacheKey = `${city}:${selectedTypes.join(",")}:${query}`;
  const cached = overpassCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const errors = [];

  for (const url of OVERPASS_URLS) {
    try {
      const data = await requestOverpass({ url, query });
      const businesses = (data.elements || [])
        .map((element) => normalizeElement({ element, city, businessType: selectedTypes.join(", ") }))
        .filter(Boolean)
        .slice(0, 120);

      const value = {
        businesses,
        source: buildSourceMeta({ status: "live", city, businessType: selectedTypes.join(", "), count: businesses.length, url })
      };
      overpassCache.set(cacheKey, { value, expiresAt: Date.now() + OVERPASS_CACHE_TTL_MS });
      if (overpassCache.size > 500) overpassCache.delete(overpassCache.keys().next().value);
      return value;
    } catch (error) {
      errors.push(`${url}: ${error.message || error.name || "request failed"}`);
    }
  }

  return {
    businesses: [],
    source: buildSourceMeta({ status: "failed", city, businessType, error: errors.join("; ") })
  };
}

async function requestOverpass({ url, query }) {
  const wait = Math.max(0, nextOverpassRequestAt - Date.now());
  nextOverpassRequestAt = Math.max(Date.now(), nextOverpassRequestAt) + OVERPASS_REQUEST_GAP_MS;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "TezTap/1.0"
      },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Overpass returned ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function buildQuery({ searchArea, queryParts }) {
  const around = `(around:${searchArea.radiusMeters},${searchArea.lat},${searchArea.lng})`;
  const selectors = queryParts.map((part) => `${part}${around};`).join("\n");

  return `
    [out:json][timeout:12];
    (
      ${selectors}
    );
    out center meta 160;
  `;
}

function normalizeElement({ element, city, businessType }) {
  const tags = element.tags || {};
  const name = tags.name || tags["name:en"] || tags.brand;

  if (!name) {
    return null;
  }

  const coordinates = element.lat && element.lon
    ? { lat: element.lat, lng: element.lon }
    : element.center
      ? { lat: element.center.lat, lng: element.center.lon }
      : null;

  if (!coordinates) {
    return null;
  }

  return {
    id: `osm-${element.type}-${element.id}`,
    name,
    area: tags["addr:suburb"] || tags["addr:district"] || tags["addr:city"] || city,
    address: formatAddress(tags),
    contactPhone: tags["contact:phone"] || tags.phone || null,
    contactEmail: tags["contact:email"] || tags.email || null,
    contactUrl: tags["contact:website"] || tags.website || null,
    coordinates,
    category: formatCategory({ tags, fallback: businessType }),
    openingHours: tags.opening_hours || null,
    rating: null,
    ratingsCount: 0,
    sourceName: "OpenStreetMap Overpass API",
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    sourceUpdatedAt: element.timestamp || null,
    sourceNote: "Live business listing from OpenStreetMap. OSM does not expose ratings or product prices.",
    samples: [],
    liveSource: "overpass"
  };
}

function formatAddress(tags) {
  const parts = [
    tags["addr:street"],
    tags["addr:housenumber"],
    tags["addr:suburb"] || tags["addr:district"],
    tags["addr:city"]
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "Address not listed in OpenStreetMap";
}

function formatCategory({ tags, fallback }) {
  return tags.amenity || tags.shop || tags.office || tags.craft || tags.leisure || tags.tourism || tags.cuisine || fallback;
}

function buildSourceMeta({ status, city, businessType, count = 0, error = null, url = null }) {
  return {
    name: "OpenStreetMap Overpass API",
    status,
    city,
    businessType,
    count,
    error,
    url,
    fetchedAt: new Date().toISOString()
  };
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

module.exports = {
  fetchBusinessesFromOverpass
};
