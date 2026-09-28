const API_KEY = process.env.TWOGIS_API_KEY || process.env.DGIS_API_KEY || process.env.TWOGIS_KEY || "";
const ROUTING_API_KEY = process.env.TWOGIS_ROUTING_API_KEY || API_KEY;
const CATALOG_BASE = process.env.TWOGIS_API_URL || "https://catalog.api.2gis.com/3.0/items";
const ROUTING_BASE = process.env.TWOGIS_ROUTING_API_URL || "https://routing.api.2gis.com";
const TIMEOUT_MS = Number(process.env.TWOGIS_TIMEOUT_MS || 9000);
const CACHE_TTL_MS = Number(process.env.TWOGIS_PLATFORM_CACHE_TTL_MS || 60000);
const cache = new Map();

async function suggest({ query, type = "object", center, limit = 8 }) {
  const q = cleanQuery(query, 1, 160);
  const allowed = new Set(["object", "address", "street", "route_endpoint", "places", "rubric"]);
  if (!allowed.has(type)) throw badRequest("Invalid suggestion type");
  const params = { q, suggest_type: type, page_size: clamp(limit, 1, 15), locale: "ru_KZ" };
  if (isCoordinate(center)) params.location = `${center.lng},${center.lat}`;
  return catalogRequest("", params, { cacheable: true, ttl: 30000 });
}

async function geocode({ query, coordinates }) {
  const params = { fields: coordinates ? "items.adm_div,items.address,items.point" : "items.point,items.geometry.centroid,items.address,items.adm_div", page_size: 5, locale: "ru_KZ" };
  if (coordinates) {
    if (!isCoordinate(coordinates)) throw badRequest("Invalid coordinates");
    params.lon = coordinates.lng;
    params.lat = coordinates.lat;
  } else {
    params.q = `${cleanQuery(query, 2, 160)}, Актау, Казахстан`;
  }
  const payload = await catalogRequest("/geocode", params, { cacheable: true });
  return (payload.result?.items || []).map(normalizeGeoItem).filter(Boolean);
}

async function regions(query) {
  const q = cleanQuery(query, 1, 160);
  return catalogRequest("https://catalog.api.2gis.com/2.0/region/search", { q, lang: "ru", fields: "items.bounds,items.default_pos,items.time_zone,items.country_code" }, { cacheable: true, ttl: 3600000 });
}

async function categories({ regionId, query, parentId }) {
  const region = cleanQuery(String(regionId || ""), 1, 40);
  if (!/^\d+$/.test(region)) throw badRequest("A valid 2GIS region ID is required");
  const params = { region_id: region };
  if (parentId && /^\d+$/.test(String(parentId))) params.parent_id = String(parentId);
  const path = query ? "/2.0/catalog/rubric/search" : "/2.0/catalog/rubric/list";
  if (query) params.q = cleanQuery(query, 1, 160);
  return catalogRequest(`https://catalog.api.2gis.com${path}`, params, { cacheable: true, ttl: 3600000 });
}

async function markers({ query, center, radiusMeters = 5000, limit = 10 }) {
  const point = requireCoordinate(center);
  const params = { q: cleanQuery(query, 1, 160), point: `${point.lng},${point.lat}`, radius: clamp(radiusMeters, 100, 25000), sort: "distance", limit: clamp(limit, 1, 10), locale: "ru_KZ" };
  return catalogRequest("https://catalog.api.2gis.com/3.0/markers", params, { cacheable: true });
}

async function route({ points, transport = "driving", routeMode = "fastest", departureAt }) {
  const routePoints = normalizePoints(points, 2, 8).map(({ lat, lng }) => ({ type: "stop", lat, lon: lng }));
  if (!["driving", "walking", "bicycle", "scooter", "motorcycle", "taxi", "truck"].includes(transport)) throw badRequest("Unsupported transport mode");
  if (!["fastest", "shortest"].includes(routeMode)) throw badRequest("Unsupported route mode");
  const body = { points: routePoints, transport, route_mode: routeMode, output: "detailed", locale: "ru" };
  if (departureAt !== undefined && departureAt !== null) {
    const utc = Number(departureAt);
    if (!Number.isInteger(utc) || utc < 1000000000 || utc > 4102444800) throw badRequest("Invalid departure time");
    body.utc = utc;
    body.traffic_mode = "statistics";
  }
  return requestJson(new URL("/routing/7.0.0/global", ROUTING_BASE), {
    method: "POST",
    body,
    cacheable: true,
    ttl: departureAt ? 15 * 60 * 1000 : 60000,
    apiKey: ROUTING_API_KEY
  });
}

async function distanceMatrix({ sources, targets, transport = "driving" }) {
  const from = normalizePoints(sources, 1, 10);
  const to = normalizePoints(targets, 1, 10);
  if (from.length * to.length > 25) throw badRequest("Distance matrix is limited to 25 route pairs per request");
  const points = [...from, ...to].map(({ lat, lng }) => ({ lat, lon: lng }));
  const url = new URL("/get_dist_matrix", ROUTING_BASE);
  url.searchParams.set("version", "2.0");
  return requestJson(url, { method: "POST", body: { points, sources: from.map((_, index) => index), targets: to.map((_, index) => index + from.length), transport }, cacheable: true, ttl: 60000, apiKey: ROUTING_API_KEY });
}

async function isochrone({ center, durations = [600, 1200], transport = "walking" }) {
  const point = requireCoordinate(center);
  const times = Array.isArray(durations) ? durations.map(Number) : [];
  if (!times.length || times.length > 5 || times.some((value) => !Number.isInteger(value) || value < 60 || value > 3600)) throw badRequest("Durations must be between 60 and 3600 seconds (up to five values)");
  if (!["driving", "walking", "bicycle", "motorcycle", "public_transport"].includes(transport)) throw badRequest("Unsupported isochrone transport mode");
  return routingRequest("/isochrone/2.0.0", { start: { lat: point.lat, lon: point.lng }, durations: times, transport, format: "wkt", detailed_response: true });
}

async function mapMatch({ points, searchRadius = 1000 }) {
  const routePoints = normalizePoints(points, 2, 1000).map(({ lat, lng }) => ({ lat, lon: lng }));
  return routingRequest("/map_matching/1.0.0", { query: routePoints, search_radius: clamp(searchRadius, 10, 1000), bad_point_tolerance: "low" });
}

async function createDeliveryPlan({ payload }) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw badRequest("A route planning payload is required");
  const waypoints = Array.isArray(payload.waypoints) ? payload.waypoints : [];
  const agents = Array.isArray(payload.agents) ? payload.agents : [];
  if (waypoints.length < 2 || waypoints.length > 25 || agents.length < 1 || agents.length > 5) throw badRequest("Delivery plan requires 2–25 stops and 1–5 couriers");
  return routingRequest("/logistics/vrp/2.0/create", payload);
}

async function catalogRequest(path, params, { cacheable = false, ttl = CACHE_TTL_MS } = {}) {
  const base = path.startsWith("http") ? path : `${CATALOG_BASE}${path}`;
  const url = new URL(base);
  for (const [name, value] of Object.entries(params || {})) if (value !== undefined && value !== null && value !== "") url.searchParams.set(name, String(value));
  return requestJson(url, { cacheable, ttl });
}
async function routingRequest(path, body) { return requestJson(new URL(path, ROUTING_BASE), { method: "POST", body, cacheable: true, ttl: 60000, apiKey: ROUTING_API_KEY }); }

async function requestJson(url, { method = "GET", body, cacheable = false, ttl = CACHE_TTL_MS, apiKey = API_KEY } = {}) {
  if (!apiKey) throw Object.assign(new Error("2GIS API key is not configured"), { statusCode: 503, code: "TWOGIS_NOT_CONFIGURED" });
  url.searchParams.set("key", apiKey);
  const cacheKey = `${method}:${url.toString().replace(apiKey, "[key]")}:${body ? JSON.stringify(body) : ""}`;
  const cached = cacheable && cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { method, headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "TezTap/1.0" }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    const providerCode = Number(payload.meta?.code);
    if (!response.ok || (providerCode && providerCode !== 200)) throw Object.assign(new Error("2GIS service request failed"), { statusCode: response.status === 404 ? 404 : response.status === 429 ? 429 : 502, providerCode: providerCode || response.status, code: "TWOGIS_UPSTREAM_ERROR" });
    if (cacheable) cache.set(cacheKey, { value: payload, expiresAt: Date.now() + ttl });
    return payload;
  } catch (error) {
    if (error.statusCode) throw error;
    throw Object.assign(new Error(error.name === "AbortError" ? "2GIS service timed out" : "2GIS service is unavailable"), { statusCode: 503, code: "TWOGIS_UNAVAILABLE" });
  } finally { clearTimeout(timeout); }
}

function normalizeGeoItem(item) {
  const point = item.point || item.geometry?.centroid || {};
  const lat = Number(point.lat), lng = Number(point.lon ?? point.lng);
  if ((!item.name && !item.address_name && !item.address?.name) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = item.address_name || item.address?.name || item.name || "Адрес не указан";
  return { id: String(item.id || `${lat}:${lng}`), address, name: item.name || address, coordinates: { lat, lng }, district: item.adm_div?.find?.((part) => /district|city_district|microdistrict/i.test(part.type || ""))?.name || null, source: "2gis", sourceLabel: "Геокодер 2ГИС" };
}
function normalizePoints(points, min, max) { if (!Array.isArray(points) || points.length < min || points.length > max) throw badRequest(`Provide between ${min} and ${max} valid points`); return points.map(requireCoordinate); }
function requireCoordinate(value) { const point = { lat: Number(value?.lat ?? value?.latitude), lng: Number(value?.lng ?? value?.lon ?? value?.longitude) }; if (!isCoordinate(point)) throw badRequest("Invalid geographic coordinates"); return point; }
function isCoordinate(value) { return value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng)) && Math.abs(Number(value.lat)) <= 90 && Math.abs(Number(value.lng)) <= 180; }
function cleanQuery(value, min, max) { const result = String(value || "").trim(); if (result.length < min || result.length > max) throw badRequest("Invalid search query"); return result; }
function clamp(value, min, max) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min; }
function badRequest(message) { return Object.assign(new Error(message), { statusCode: 400, code: "INVALID_REQUEST" }); }
module.exports = { suggest, geocode, regions, categories, markers, route, distanceMatrix, isochrone, mapMatch, createDeliveryPlan };
