const API_URL = process.env.TWOGIS_API_URL || "https://catalog.api.2gis.com/3.0/items";
const { getCitySearchArea } = require("../data/cities");
const { getBusinessProfile } = require("../data/competitors");
const API_KEY = String(process.env.TWOGIS_API_KEY || "").trim();
const TIMEOUT_MS = Math.max(2000, Math.min(20000, Number(process.env.TWOGIS_TIMEOUT_MS) || 9000));
const CACHE_TTL_MS = Math.max(30_000, Number(process.env.TWOGIS_CACHE_TTL_MS) || 300_000);
const PAGE_SIZE = Math.max(1, Math.min(50, Number(process.env.TWOGIS_PAGE_SIZE) || 50));
const configuredMaxResults = Number(process.env.TWOGIS_MAX_RESULTS ?? 0);
const MAX_RESULTS = configuredMaxResults > 0 ? configuredMaxResults : Infinity;
const GRID_SIZE = Math.max(1, Math.min(9, Number(process.env.TWOGIS_TILE_GRID_SIZE) || 5));
const TILING_ENABLED = String(process.env.TWOGIS_ENABLE_TILING || "true").toLowerCase() !== "false";
const REQUEST_GAP_MS = Math.max(250, Number(process.env.TWOGIS_REQUEST_GAP_MS) || 1100);
const cache = new Map();
let nextRequestAt = 0;
let resolvedPageSize = null;

const FIELD_LIST = [
  "items.point", "items.address", "items.full_address_name", "items.rubrics",
  "items.reviews", "items.schedule", "items.description", "items.name_ex", "items.dates"
].join(",");

function isValidPoint(point) {
  return point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)) &&
    Math.abs(Number(point.lat)) <= 90 && Math.abs(Number(point.lng)) <= 180;
}

function tileCenters(center, radiusKm, gridSize = GRID_SIZE) {
  if (!TILING_ENABLED || gridSize <= 1) return [{ center, radiusKm }];
  const latRadius = radiusKm / 111.32;
  const cosLat = Math.max(0.2, Math.cos(Number(center.lat) * Math.PI / 180));
  const lngRadius = radiusKm / (111.32 * cosLat);
  const cellHeight = (latRadius * 2) / gridSize;
  const cellWidth = (lngRadius * 2) / gridSize;
  const tileRadiusKm = Math.min(50, Math.sqrt((cellHeight * 111.32 / 2) ** 2 + (cellWidth * 111.32 * cosLat / 2) ** 2));
  const tiles = [];
  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      tiles.push({
        center: {
          lat: Number(center.lat) - latRadius + cellHeight * (row + 0.5),
          lng: Number(center.lng) - lngRadius + cellWidth * (column + 0.5)
        },
        radiusKm: tileRadiusKm
      });
    }
  }
  return tiles;
}

async function waitForSlot() {
  const now = Date.now();
  const wait = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + REQUEST_GAP_MS;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
}

async function fetchPage({ query, center, radiusKm, page, pageSize, signal, sort, branchOnly }) {
  await waitForSlot();
  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    key: API_KEY,
    q: query,
    point: `${center.lng},${center.lat}`,
    radius: String(Math.max(1, Math.min(50_000, Math.ceil(radiusKm * 1000)))),
    page: String(page),
    page_size: String(pageSize),
    fields: FIELD_LIST,
    locale: "ru_KZ",
    sort: sort || "distance",
    ...(branchOnly ? { type: "branch" } : {})
  });
  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: requestSignal });
  const payload = await response.json().catch(() => ({}));
  const providerCode = Number(payload?.meta?.code) || response.status;
  const providerMessage = String(payload?.meta?.error?.message || payload?.meta?.error?.type || "");
  if (providerCode === 404 && /results? not found/i.test(providerMessage)) {
    return { items: [], total: 0, usedPageSize: pageSize };
  }
  if (!response.ok || payload?.meta?.code && providerCode !== 200) {
    const safeProviderMessage = providerMessage.slice(0, 180);
    const error = new Error(`2GIS Places API returned ${providerCode}${safeProviderMessage ? `: ${safeProviderMessage}` : ""}`);
    error.status = providerCode;
    error.reason = payload?.meta?.error?.type || null;
    throw error;
  }
  return { ...(payload?.result || {}), usedPageSize: pageSize };
}

async function fetchPageWithCompatibleSize(options) {
  const preferredSize = resolvedPageSize || PAGE_SIZE;
  try {
    const result = await fetchPage({ ...options, pageSize: preferredSize });
    resolvedPageSize = preferredSize;
    return result;
  } catch (error) {
    // Demo keys are restricted to page_size <= 10. Retry transparently while
    // keeping the same page number so pagination still returns the full set.
    if (preferredSize <= 10 || ![400, 403].includes(Number(error.status))) throw error;
    resolvedPageSize = 10;
    return fetchPage({ ...options, pageSize: resolvedPageSize });
  }
}

async function collectTile({ query, center, radiusKm, maxItems, signal, sort, branchOnly, minRating, onBatch }) {
  const items = [];
  let page = 1;
  let total = Infinity;
  let effectivePageSize = PAGE_SIZE;
  while (page <= 5 && items.length < maxItems && (page - 1) * effectivePageSize < total) {
    const result = await fetchPageWithCompatibleSize({ query, center, radiusKm, page, pageSize: PAGE_SIZE, signal, sort, branchOnly });
    effectivePageSize = Number(result.usedPageSize) || PAGE_SIZE;
    const pageItems = Array.isArray(result.items) ? result.items : [];
    total = Number.isFinite(Number(result.total)) ? Number(result.total) : pageItems.length;
    items.push(...pageItems);
    if (onBatch) onBatch(pageItems.map(normalizePlace).filter((item) => item && (minRating == null || item.rating != null && item.rating >= minRating)));
    // 2GIS documents sort=rating as descending; pages below the threshold
    // cannot contain further eligible results.
    if (sort === "rating" && minRating != null && pageItems.length && pageItems.every((item) => {
      const rating = normalizePlace(item)?.rating;
      return rating != null && rating < minRating;
    })) break;
    if (!pageItems.length || pageItems.length < effectivePageSize || items.length >= total) break;
    page += 1;
  }
  return items.slice(0, maxItems);
}

function normalizePlace(item) {
  const point = item?.point || item?.geometry?.centroid;
  let coordinates = point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon))
    ? { lat: Number(point.lat), lng: Number(point.lon) }
    : null;
  if (!coordinates && typeof point === "string") {
    const match = point.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
    if (match) coordinates = { lng: Number(match[1]), lat: Number(match[2]) };
  }
  if (!isValidPoint(coordinates) || !item?.id || !item?.name) return null;
  const rawRating = item.reviews?.general_rating ?? item.reviews?.rating ?? item.rating;
  const rawReviewCount = item.reviews?.general_review_count ?? item.reviews?.review_count ?? item.rating_count;
  const ratingValue = rawRating == null || rawRating === "" ? NaN : Number(rawRating);
  const reviewCountValue = rawReviewCount == null || rawReviewCount === "" ? NaN : Number(rawReviewCount);
  const rating = Number.isFinite(ratingValue) && ratingValue >= 0 && ratingValue <= 5 ? ratingValue : null;
  const ratingCount = Number.isFinite(reviewCountValue) && reviewCountValue >= 0 ? reviewCountValue : null;
  const rubric = Array.isArray(item.rubrics) ? item.rubrics.map((value) => typeof value === "string" ? value : value?.name).filter(Boolean) : [];
  return {
    id: `2gis-${item.id}`,
    title: String(item.name).slice(0, 180),
    provider: String(item.name).slice(0, 180),
    description: String(item.description || "").slice(0, 600),
    coordinates,
    address: item.full_address_name || item.address?.name || item.address_name || "",
    district: item.adm_div?.[0]?.name || "",
    categoryLabel: rubric.join(", "),
    rating,
    ratingCount,
    openingHours: item.schedule?.description || item.schedule?.text || null,
    source: "2gis",
    sourceLabel: "2ГИС · Places API",
    sourceUrl: `https://2gis.kz/aktau/firm/${encodeURIComponent(String(item.id))}`,
    lastUpdatedAt: item.dates?.updated_at || null,
    demo: false
  };
}

async function search2GISBusinesses({ query, center, radiusKm = 10, signal, tileGridSize = GRID_SIZE, sort = "distance", branchOnly = false, minRating = null, onBatch }) {
  const safeQuery = String(query || "").trim().slice(0, 160);
  const safeRadius = Math.max(1, Math.min(25, Number(radiusKm) || 10));
  if (!API_KEY || !safeQuery || !isValidPoint(center)) return { items: [], status: API_KEY ? "skipped" : "not_configured", source: "2ГИС · Places API" };
  const gridSize = Math.max(1, Math.min(9, Number(tileGridSize) || GRID_SIZE));
  const cacheKey = JSON.stringify([safeQuery.toLowerCase(), center.lat, center.lng, safeRadius, gridSize, Number.isFinite(MAX_RESULTS) ? MAX_RESULTS : "all", sort, branchOnly, minRating]);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) { if (onBatch) onBatch(cached.value.items); return { ...cached.value, cache: "hit" }; }

  const tiles = tileCenters(center, safeRadius, gridSize);
  const perTileLimit = Number.isFinite(MAX_RESULTS) ? Math.max(1, Math.ceil(MAX_RESULTS / tiles.length)) : Infinity;
  const raw = [];
  const errors = [];
  for (const tile of tiles) {
    if (signal?.aborted) throw new DOMException("Search aborted", "AbortError");
    try {
      raw.push(...await collectTile({ query: safeQuery, ...tile, maxItems: perTileLimit, signal, sort, branchOnly, minRating, onBatch }));
    } catch (error) {
      errors.push(error.message || "2GIS request failed");
      if (!raw.length) break;
    }
  }
  const deduped = new Map();
  for (const item of raw) {
    const normalized = normalizePlace(item);
    if (normalized && (minRating == null || normalized.rating != null && normalized.rating >= minRating)) deduped.set(normalized.id, normalized);
  }
  const value = { items: [...deduped.values()], status: errors.length ? (deduped.size ? "partial" : "failed") : "ok", source: "2ГИС · Places API", errors: errors.length ? [...new Set(errors)].slice(0, 2) : [] };
  if (!errors.length) cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return { ...value, cache: "miss", gridSize: TILING_ENABLED ? gridSize : 1, requestedMax: Number.isFinite(MAX_RESULTS) ? MAX_RESULTS : null };
}

async function search2GISPage({ query, center, radiusKm = 25, page = 1, sort = "rating", branchOnly = true, signal }) {
  const safeQuery = String(query || "").trim().slice(0, 160);
  const safeRadius = Math.max(1, Math.min(25, Number(radiusKm) || 25));
  const safePage = Math.max(1, Math.min(5, Math.floor(Number(page) || 1)));
  if (!API_KEY || !safeQuery || !isValidPoint(center)) return { items: [], total: 0, page: safePage, pageSize: 0, hasMore: false, status: API_KEY ? "skipped" : "not_configured" };
  const result = await fetchPageWithCompatibleSize({ query: safeQuery, center, radiusKm: safeRadius, page: safePage, sort, branchOnly, signal });
  const items = (Array.isArray(result.items) ? result.items : []).map(normalizePlace).filter(Boolean);
  const pageSize = Number(result.usedPageSize) || PAGE_SIZE;
  const total = Number(result.total) || 0;
  return { items, total, page: safePage, pageSize, hasMore: safePage < 5 && safePage * pageSize < total, pageLimit: 5, status: "ok", source: "2ГИС Places API" };
}

// Backward-compatible adapter used by TezTap's original analysis pipeline.
async function fetchBusinessesFrom2GIS({ city, businessType }) {
  const area = getCitySearchArea(city);
  const profile = getBusinessProfile(businessType);
  if (!area) return { businesses: [], source: { name: "2GIS Places API", status: "unsupported_city" } };
  try {
    const result = await search2GISBusinesses({
      query: String(profile.title || businessType || "business"),
      center: { lat: area.lat, lng: area.lng },
      radiusKm: Math.min(25, (area.radiusMeters || area.radius || 9500) / 1000)
    });
    const businesses = result.items.map((place) => ({
      id: place.id,
      name: place.title,
      area: place.district || city,
      address: place.address || "",
      category: place.categoryLabel || profile.title,
      coordinates: place.coordinates,
      rating: place.rating,
      ratingsCount: place.ratingCount,
      sourceName: "2GIS Places API",
      sourceUrl: place.sourceUrl,
      sourceUpdatedAt: place.lastUpdatedAt,
      prices: [],
      samples: []
    }));
    return { businesses, source: { name: "2GIS Places API", status: result.status, cache: result.cache || "miss", count: businesses.length } };
  } catch (error) {
    // Keep TezTap analysis available when the external map provider is down.
    return { businesses: [], source: { name: "2GIS Places API", status: "unavailable", error: error.message } };
  }
}

module.exports = { fetchBusinessesFrom2GIS, search2GISBusinesses, search2GISPage, normalize2GISPlace: normalizePlace, tile2GISSearchArea: tileCenters };
