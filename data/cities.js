const CITY_REGISTRY = Object.freeze([
  {
    id: "aktau",
    name: "Aktau",
    country: "Kazakhstan",
    countryCode: "KZ",
    aliases: ["Актау", "Ақтау"],
    center: { lat: 43.6532, lng: 51.1975 },
    searchRadiusMeters: 9500,
    sourceReadiness: "seed-and-live"
  },
  {
    id: "almaty",
    name: "Almaty",
    country: "Kazakhstan",
    countryCode: "KZ",
    aliases: ["Алматы", "Алма-Ата"],
    center: { lat: 43.2389, lng: 76.8897 },
    searchRadiusMeters: 14000,
    sourceReadiness: "live"
  },
  {
    id: "astana",
    name: "Astana",
    country: "Kazakhstan",
    countryCode: "KZ",
    aliases: ["Астана", "Нур-Султан", "Nur-Sultan"],
    center: { lat: 51.1694, lng: 71.4491 },
    searchRadiusMeters: 18000,
    sourceReadiness: "live"
  }
]);

function normalizeCityKey(value) {
  return String(value || "").trim().toLowerCase();
}

function getCityConfig(city) {
  const normalizedCity = normalizeCityKey(city);

  return CITY_REGISTRY.find((entry) => (
    normalizeCityKey(entry.id) === normalizedCity ||
    normalizeCityKey(entry.name) === normalizedCity ||
    entry.aliases.some((alias) => normalizeCityKey(alias) === normalizedCity)
  )) || null;
}

function listSupportedCities() {
  return CITY_REGISTRY.map((city) => city.name);
}

function getCitySearchArea(city) {
  const config = getCityConfig(city);

  if (!config) {
    return null;
  }

  return {
    lat: config.center.lat,
    lng: config.center.lng,
    radius: config.searchRadiusMeters,
    radiusMeters: config.searchRadiusMeters
  };
}

module.exports = {
  CITY_REGISTRY,
  normalizeCityKey,
  getCityConfig,
  getCitySearchArea,
  listSupportedCities
};
