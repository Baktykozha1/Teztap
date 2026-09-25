const crypto = require("node:crypto");
const { city } = require("../data/neighborhood");

const ENDPOINT = process.env.NEIGHBORHOOD_OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const TTL_MS = 60 * 60 * 1000;
let cached = null;
let pending = null;

async function listOpenNeighborhoodLocations() {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (pending) return pending;
  pending = fetchOpenLocations().then((value) => {
    cached = { value, expiresAt: Date.now() + TTL_MS };
    return value;
  }).catch(() => {
    if (cached) return cached.value;
    cached = { value: [], expiresAt: Date.now() + 60_000 };
    return [];
  }).finally(() => { pending = null; });
  return pending;
}

async function fetchOpenLocations() {
  const query = `[out:json][timeout:20];(node["place"~"suburb|neighbourhood"]["name"](around:25000,${city.coordinates.lat},${city.coordinates.lng});way["building"~"apartments|residential"]["addr:housenumber"](around:25000,${city.coordinates.lat},${city.coordinates.lng});node["building"~"apartments|residential"]["addr:housenumber"](around:25000,${city.coordinates.lat},${city.coordinates.lng}););out center meta 1500;`;
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "User-Agent": "TezTap/1.0 (Aktau neighborhood directory)" },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
  const payload = await response.json();
  const microdistricts = new Map();
  const buildings = [];
  for (const element of payload.elements || []) {
    const point = element.center || element;
    const coordinates = { lat: Number(point.lat), lng: Number(point.lon) };
    if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) continue;
    const tags = element.tags || {};
    const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
    const areaName = String(tags["addr:suburb"] || tags["addr:district"] || "").trim().slice(0, 100);
    if (tags.place && tags.name) {
      const name = String(tags.name).trim().slice(0, 100);
      if (/микрорайон|мкр|microdistrict|район/i.test(name)) microdistricts.set(normalizeName(name), { id: areaId(name), type: "microdistrict", parentId: city.id, name, address: `${name}, Актау`, coordinates, source: "openstreetmap", sourceLabel: "OpenStreetMap · название и точка", sourceUrl, sourceUpdatedAt: element.timestamp || null, verificationStatus: "open-data-unverified", demo: false });
    }
    if (!tags.building || !tags["addr:housenumber"] || !areaName) continue;
    const house = String(tags["addr:housenumber"]).trim().slice(0, 30);
    if (!/^[\p{L}\p{N}\s\-/]+$/u.test(house)) continue;
    const mdKey = normalizeName(areaName);
    if (!microdistricts.has(mdKey)) microdistricts.set(mdKey, { id: areaId(areaName), type: "microdistrict", parentId: city.id, name: areaName, address: `${areaName}, Актау`, coordinates, source: "openstreetmap", sourceLabel: "OpenStreetMap · адресная привязка", sourceUrl, sourceUpdatedAt: element.timestamp || null, verificationStatus: "open-data-unverified", demo: false });
    buildings.push({ id: `osm-${element.type}-${element.id}`, type: "building", parentId: microdistricts.get(mdKey).id, name: `Дом ${house}`, address: [tags["addr:street"], house, areaName, "Актау"].filter(Boolean).join(", "), coordinates, source: "openstreetmap", sourceLabel: "OpenStreetMap · адрес здания", sourceUrl, sourceUpdatedAt: element.timestamp || null, verificationStatus: "open-data-unverified", demo: false });
  }
  return [...microdistricts.values(), ...buildings];
}

function normalizeName(name) { return String(name).toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim(); }
function areaId(name) { return `osm-area-${crypto.createHash("sha1").update(normalizeName(name)).digest("hex").slice(0, 14)}`; }

module.exports = { listOpenNeighborhoodLocations };
