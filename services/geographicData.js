const { fetchBusinessesFromOverpass } = require("./overpass");
const { search2GISBusinesses } = require("./twogis");
const { listings: demoListings } = require("../data/discovery");

const AKTAU = { lat: 43.6353, lng: 51.1682 };
const CACHE_TTL_MS = Number(process.env.GEO_CACHE_TTL_MS || 5 * 60 * 1000);
const REQUEST_GAP_MS = Number(process.env.GEO_REQUEST_GAP_MS || 1100);
const cache = new Map();
let nextExternalRequestAt = 0;

const CATEGORY_QUERIES = {
  places: ["cafe", "restaurant", "clinic", "pharmacy", "fitness", "beauty_salon", "grocery", "clothing", "electronics", "entertainment"],
  education: ["school", "childcare", "language_school", "college", "university", "music_school", "driving_school", "educational_institution"], jobs: ["office"],
  services: ["handyman", "plumber", "electrician", "cleaner", "beauty_salon", "photographer", "courier"], marketplace: []
};
const DISCOVERY_CATEGORIES = Object.keys(CATEGORY_QUERIES);

function validCoordinates(value) {
  return value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng)) &&
    Math.abs(Number(value.lat)) <= 90 && Math.abs(Number(value.lng)) <= 180;
}

function haversineKm(a, b) {
  const rad = (n) => n * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function normalizeRecord(record, { center = AKTAU, source = "demo", sourceLabel = "Демо-данные MVP" } = {}) {
  if (!DISCOVERY_CATEGORIES.includes(record.category)) return null;
  const coordinates = record.coordinates || (record.latitude != null ? { lat: Number(record.latitude), lng: Number(record.longitude) } : null);
  if (!validCoordinates(coordinates)) return null;
  const distanceKm = center && validCoordinates(center) ? Number(haversineKm(center, coordinates).toFixed(2)) : null;
  return {
    id: String(record.id), category: record.category, subtype: record.subtype || "other", subtypeLabel: record.categoryLabel || record.subtypeLabel || null,
    title: record.title || record.name || "Без названия", description: record.description || "",
    provider: record.provider || record.name || "", city: record.city || "Актау",
    district: record.district || record.area || "", address: record.address || "Адрес не указан",
    locationKind: record.locationKind || null,
    coordinates: { lat: Number(coordinates.lat), lng: Number(coordinates.lng) }, distanceKm,
    source: record.source || source, sourceLabel: record.sourceLabel || sourceLabel,
    sourceUrl: record.sourceUrl || null, lastUpdatedAt: record.lastUpdatedAt || record.sourceUpdatedAt || null,
    contactPhone: record.contactPhone || null, contactEmail: record.contactEmail || null,
    demoContact: record.demo === true ? record.demoContact || null : null,
    contactUrl: record.contactUrl && /^https:\/\//i.test(record.contactUrl) ? record.contactUrl : null,
    education: record.education && typeof record.education === "object" ? record.education : null,
    job: record.job && typeof record.job === "object" ? record.job : null,
    service: record.service && typeof record.service === "object" ? record.service : null,
    priceLabel: record.priceLabel || null, priceAmount: record.priceAmount ?? null,
    currency: record.currency || "KZT", rating: record.rating ?? null, ratingCount: record.ratingCount ?? null,
    reviewSummary: record.reviewSummary || null, tags: Array.isArray(record.tags) ? record.tags : [],
    demo: record.source === "demo" || record.demo === true, available: record.available ?? null,
    availabilityStatus: record.availabilityStatus || null, openingHours: record.openingHours || null,
    openUntilHour: record.openUntilHour ?? null, availableToday: record.availableToday ?? null,
    marketplace: record.marketplace && typeof record.marketplace === "object" ? record.marketplace : null,
    place: record.place && typeof record.place === "object" ? record.place : null
  };
}

function normalize2GISEducation(item, center = AKTAU) {
  if (!item || item.rating == null || Number(item.rating) < 3.5) return null;
  const titleText = String(item.title || "").toLocaleLowerCase("ru-RU");
  const rubricText = String(item.categoryLabel || "").toLocaleLowerCase("ru-RU");
  const text = `${titleText} ${rubricText}`;
  const educationalEvidence = /(\u0440\u0435\u043f\u0435\u0442\u0438\u0442\u043e\u0440|\u043f\u0440\u0435\u043f\u043e\u0434\u0430\u0432|\u0448\u043a\u043e\u043b|\u043b\u0438\u0446\u0435\u0439|\u0433\u0438\u043c\u043d\u0430\u0437|\u043a\u043e\u043b\u043b\u0435\u0434\u0436|\u0443\u043d\u0438\u0432\u0435\u0440\u0441\u0438\u0442\u0435\u0442|\u0430\u043a\u0430\u0434\u0435\u043c|\u043e\u0431\u0440\u0430\u0437\u043e\u0432\u0430\u0442|\u0443\u0447\u0435\u0431|\u043e\u0431\u0443\u0447|\u043a\u0443\u0440\u0441|\u044f\u0437\u044b\u043a|\u044d\u043a\u0437\u0430\u043c\u0435\u043d|\u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432|\u0434\u0435\u0442\u0441\u043a.*\u0446\u0435\u043d\u0442|school|education|tutor|teacher|course|language|college|university|academy|learning|training|exam prep|driving school)/i.test(text);
  if (!educationalEvidence) return null;
  const titleEducationEvidence = /(репетитор|преподав|школ|лицей|гимназ|колледж|университет|академ|учебн|образоват|языков|school|education|tutor|teacher|college|university|academy|learning center)/i.test(titleText);
  const rubricEducationEvidence = /(школ|лицей|гимназ|колледж|университет|академ|учебн|образоват|помощь в обучении|репетитор|языковая школа|центр раннего развития|курсы английского|подготовка к экзамен|school|education|tutor|language school|learning center)/i.test(rubricText);
  if (!titleEducationEvidence && !rubricEducationEvidence) return null;
  const explicitInstitution = /центр|школ|дворец|колледж|лицей|гимнази/.test(titleText);
  const subtype = /(^|[^а-яё])ент([^а-яё]|$)|экзамен|подготовк к экзамен/.test(titleText) ? "Exam prep"
    : /языков|language|английск|немецк|корейск|китайск/.test(titleText) ? "Language schools"
      : /репетитор|частный преподаватель/.test(titleText) && !explicitInstitution ? "Tutors"
        : /языков|language/.test(rubricText) && !explicitInstitution ? "Language schools"
          : /курс|программирован|робототехник/.test(titleText) || /компьютерные курсы|курсы робототехники/.test(rubricText) && !explicitInstitution ? "Courses"
            : "Educational centers";
  const subjects = [
    [/математик|алгебр|геометри/, "Математика"], [/английск|english/, "Английский язык"],
    [/казахск|қазақ/, "Казахский язык"], [/русск.*язык/, "Русский язык"], [/физик/, "Физика"],
    [/хими/, "Химия"], [/биологи/, "Биология"], [/истори/, "История"],
    [/информатик|программирован|it-курс|айти/, "Программирование и ИТ"], [/немецк/, "Немецкий язык"],
    [/китайск/, "Китайский язык"], [/корейск/, "Корейский язык"], [/(^|[^а-яё])ент([^а-яё]|$)/, "Подготовка к ЕНТ"],
    [/рисован|живопис|изобразительн/, "Рисование"], [/музык|вокал|фортепиано/, "Музыка"]
  ].filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  const subtypeLabels = { Tutors: "Репетиторы", Courses: "Учебные курсы", "Language schools": "Языковые школы", "Exam prep": "Подготовка к экзаменам", "Educational centers": "Учебные центры" };
  return normalizeRecord({
    ...item, category: "education", subtype, categoryLabel: subtypeLabels[subtype],
    source: "2gis", sourceLabel: "Данные предоставлены 2ГИС", demo: false,
    education: { subjects, rubric: item.categoryLabel || null, qualifications: null, experienceYears: null, format: null, lessonType: null, schedule: null }
  }, { center, source: "2gis", sourceLabel: "Данные предоставлены 2ГИС" });
}

// Adapters keep the UI independent from providers. Public datasets and user/organization
// records can be added by implementing list(); all output passes through normalizeRecord.
const adapters = {
  twogis: { name: "2ГИС · Places API", async list({ category, center, radiusKm, query = "", page = 1, signal }) {
    // 2ГИС is the organization directory for Places and education; it does not
    // invent vacancies, tutor schedules, service prices, or marketplace posts.
    if (!query.trim() || !["all", "places", "education", "services"].includes(category)) return [];
    const result = await search2GISBusinesses({ query, center, radiusKm, page, signal });
    if (["failed", "not_configured"].includes(result.status) && !result.items.length) {
      const error = new Error(result.errors?.[0] || (result.status === "not_configured" ? "2GIS key is not configured" : "2GIS search failed"));
      error.source = "2ГИС · Places API";
      throw error;
    }
    const normalizedItems = result.items.map((item) => {
      const categoryText = `${item.categoryLabel || ""} ${query}`.toLowerCase();
      const resolvedCategory = category === "all" ? "places" : category;
      const subtype = resolvedCategory === "education"
        ? /language|язык|языков/.test(categoryText) ? "Language schools" : /school|школ|лицей|гимнази/.test(categoryText) ? "school" : "Educational centers"
        : resolvedCategory === "services" ? normalizeServiceSubtype(categoryText) : normalizePlaceSubtype(categoryText);
      return normalizeRecord({
        ...item,
        category: resolvedCategory,
        subtype,
        categoryLabel: item.categoryLabel,
        source: "2gis",
        sourceLabel: item.sourceLabel,
        sourceUrl: item.sourceUrl,
        lastUpdatedAt: item.lastUpdatedAt,
        place: resolvedCategory === "places" ? { rubric: item.categoryLabel || null } : null,
        service: resolvedCategory === "services" ? { category: item.categoryLabel || query, startingPrice: null, portfolioImages: [], serviceArea: item.district || null } : null,
        education: resolvedCategory === "education" ? { subjects: [], qualifications: [], experienceYears: null, format: "Offline", lessonType: "Group", schedule: null } : null
      }, { center, source: "2gis", sourceLabel: "2ГИС · Places API" });
    }).filter(Boolean);
    normalizedItems.hasMore = Boolean(result.hasMore);
    normalizedItems.total = Number(result.total) || normalizedItems.length;
    normalizedItems.providerCache = result.cache || "miss";
    return normalizedItems;
  } },
  osm: { name: "OpenStreetMap", async list({ category, center, radiusKm }) {
    const layers = category === "all" ? DISCOVERY_CATEGORIES : [category];
    const output = [];
    for (const layer of layers) {
      const businessTypes = CATEGORY_QUERIES[layer] || [];
      if (!businessTypes.length) continue;
      const result = await fetchBusinessesFromOverpass({ city: "Aktau", businessType: businessTypes[0], businessTypes, center, radiusMeters: radiusKm * 1000 });
      if (result.source?.status === "failed") throw new Error("Overpass unavailable");
      for (const item of result.businesses || []) output.push(normalizeRecord({
        id: item.id, category: layer, subtype: layer === "services" ? normalizeServiceSubtype(item.category) : layer === "places" ? normalizePlaceSubtype(item.category) : item.category, title: item.name, provider: item.name,
        city: "Актау", district: item.area, address: item.address, coordinates: item.coordinates,
        openingHours: item.openingHours || null,
        contactPhone: item.contactPhone, contactEmail: item.contactEmail, contactUrl: item.contactUrl,
        source: "openstreetmap", sourceLabel: "OpenStreetMap · Overpass API", sourceUrl: item.sourceUrl,
        lastUpdatedAt: item.sourceUpdatedAt
      }, { center, source: "openstreetmap", sourceLabel: "OpenStreetMap · Overpass API" }));
    }
    return output.filter(Boolean);
  } },
  publicDataset: { name: process.env.PUBLIC_GEO_DATA_NAME || "Public datasets", async list({ category, center }) {
    const endpoint = process.env.PUBLIC_GEO_DATA_URL;
    if (!endpoint) return [];
    try {
      const url = new URL(endpoint);
      if (url.protocol !== "https:") return [];
      await throttleExternal();
      const response = await fetch(url, { headers: { "User-Agent": "TezTap/1.0 (Aktau discovery app)", Accept: "application/json" }, signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error(`Public dataset returned ${response.status}`);
      const payload = await response.json();
      const sourceItems = Array.isArray(payload) ? payload : payload.items;
      if (!Array.isArray(sourceItems)) return [];
      return sourceItems.slice(0, 300).filter((item) => item.category && (category === "all" || item.category === category)).map((item) => normalizeRecord({
        ...item, source: "public_dataset", sourceLabel: item.sourceLabel || process.env.PUBLIC_GEO_DATA_NAME || "Публичный набор данных",
        sourceUrl: item.sourceUrl || url.origin, lastUpdatedAt: item.lastUpdatedAt || payload.updatedAt || null, demo: false
      }, { center, source: "public_dataset", sourceLabel: process.env.PUBLIC_GEO_DATA_NAME || "Публичный набор данных" })).filter(Boolean);
    } catch (error) {
      throw error;
    }
  } },
  userGenerated: { name: "Community listings", async list({ category, center }) {
    let educationRecords = [];
    let jobRecords = [];
    if (category === "education" || category === "all") {
      const { listPublicEducationListings } = require("./educationListings");
      const educationListings = await listPublicEducationListings({ city: "Актау", limit: 200 });
      educationRecords = educationListings.map((item) => normalizeRecord({
        ...item,
        category: "education",
        coordinates: item.coordinates || { lat: item.latitude, lng: item.longitude },
        source: "user_generated",
        sourceLabel: item.sourceLabel || "Объявление пользователя · не проверено",
        demo: false
      }, { center, source: "user_generated", sourceLabel: "Объявление пользователя · не проверено" })).filter(Boolean);
    }
    if (category === "jobs" || category === "all") {
      const { listPublicJobListings } = require("./jobListings");
      const jobListings = await listPublicJobListings({ city: "Актау", limit: 200 });
      jobRecords = jobListings.map((item) => normalizeRecord({
        ...item, category: "jobs", coordinates: item.coordinates || { lat: item.latitude, lng: item.longitude },
        source: "user_generated", sourceLabel: item.sourceLabel || "Объявление работодателя · не проверено", demo: false
      }, { center, source: "user_generated", sourceLabel: "Объявление работодателя · не проверено" })).filter(Boolean);
    }
    if (category === "education") return educationRecords;
    if (category === "jobs") return jobRecords;
    if (category !== "marketplace" && category !== "all") return [];
    try {
      const { listPublicProperties } = require("./properties");
      const properties = await listPublicProperties({ city: "Aktau", limit: 120 });
      return [...educationRecords, ...jobRecords, ...properties.map((item) => normalizeRecord({
        id: `property-${item.id}`, category: "marketplace", subtype: item.transactionType === "RENT" ? "Rent" : "Buy",
        title: item.title, description: item.description, provider: "Объявление пользователя", city: item.city,
        district: item.districtId, address: item.address, latitude: item.latitude, longitude: item.longitude,
        priceLabel: `${item.price} ${item.currency || "KZT"}${item.transactionType === "RENT" ? " / месяц" : ""}`,
        priceAmount: item.price, currency: item.currency || "KZT", source: "user_generated",
        sourceLabel: item.status === "VERIFIED" ? "Объявление пользователя · проверено" : "Объявление пользователя · публичное",
        sourceUrl: item.sourceUrl, lastUpdatedAt: item.updatedAt || item.createdAt, demo: false
      }, { center, source: "user_generated", sourceLabel: "Объявление пользователя" })).filter(Boolean)];
    } catch (error) {
      throw error;
    }
  } },
  organization: { name: process.env.ORGANIZATION_GEO_DATA_NAME || "Organization submissions", async list({ category, center }) {
    const endpoint = process.env.ORGANIZATION_GEO_DATA_URL;
    if (!endpoint) return [];
    try {
      const url = new URL(endpoint);
      if (url.protocol !== "https:") return [];
      await throttleExternal();
      const response = await fetch(url, { headers: { "User-Agent": "TezTap/1.0 (Aktau discovery app)", Accept: "application/json" }, signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error(`Organization source returned ${response.status}`);
      const payload = await response.json();
      const sourceItems = Array.isArray(payload) ? payload : payload.items;
      if (!Array.isArray(sourceItems)) return [];
      return sourceItems.slice(0, 300).filter((item) => item.category && (category === "all" || item.category === category)).map((item) => normalizeRecord({
        ...item, source: "organization", sourceLabel: item.sourceLabel || process.env.ORGANIZATION_GEO_DATA_NAME || "Данные организации",
        sourceUrl: item.sourceUrl || url.origin, lastUpdatedAt: item.lastUpdatedAt || payload.updatedAt || null, demo: false
      }, { center, source: "organization", sourceLabel: process.env.ORGANIZATION_GEO_DATA_NAME || "Данные организации" })).filter(Boolean);
    } catch (error) {
      throw error;
    }
  } },
  demo: { name: "MVP demo directory", async list({ category, center }) {
    return demoListings.filter((item) => category === "all" || item.category === category)
      .map((item) => normalizeRecord(item, { center, source: "demo", sourceLabel: "Демо-данные MVP · не проверено" })).filter(Boolean);
  } }
};

function normalizeServiceSubtype(value) {
  const subtype = String(value || "").toLowerCase();
  if (/\u0441\u0430\u043d\u0442\u0435\u0445\u043d\u0438\u043a/.test(subtype)) return "Plumbers";
  if (/\u044d\u043b\u0435\u043a\u0442\u0440\u0438\u043a/.test(subtype)) return "Electricians";
  if (/\u0443\u0431\u043e\u0440\u043a|\u043a\u043b\u0438\u043d\u0438\u043d/.test(subtype)) return "Cleaners";
  if (/\u043a\u0440\u0430\u0441\u043e\u0442|\u0441\u0430\u043b\u043e\u043d|\u043f\u0430\u0440\u0438\u043a\u043c\u0430\u0445\u0435\u0440/.test(subtype)) return "Beauty professionals";
  if (/\u0444\u043e\u0442\u043e\u0433\u0440\u0430\u0444/.test(subtype)) return "Photographers";
  if (/\u0434\u043e\u0441\u0442\u0430\u0432\u043a|\u043a\u0443\u0440\u044c\u0435\u0440/.test(subtype)) return "Delivery";
  if (/plumb/.test(subtype)) return "Plumbers";
  if (/electric/.test(subtype)) return "Electricians";
  if (/clean/.test(subtype)) return "Cleaners";
  if (/beauty|hairdresser/.test(subtype)) return "Beauty professionals";
  if (/photo/.test(subtype)) return "Photographers";
  if (/courier|deliver/.test(subtype)) return "Delivery";
  return "Repair specialists";
}

function normalizePlaceSubtype(value) {
  const subtype = String(value || "").toLowerCase();
  if (/\u0440\u0435\u0441\u0442\u043e\u0440\u0430\u043d|\u043a\u0430\u0444\u0435-\u0440\u0435\u0441\u0442\u043e\u0440\u0430\u043d/.test(subtype)) return "Restaurants";
  if (/\u043a\u0430\u0444\u0435|\u043a\u043e\u0444\u0435\u0439\u043d|cafe|\bcafe\b|fast_food|coffee/.test(subtype)) return "Cafes";
  if (/\u0441\u043f\u043e\u0440\u0442\u0437\u0430\u043b|\u0444\u0438\u0442\u043d\u0435\u0441|\u0441\u043f\u043e\u0440\u0442\u0438\u0432\u043d/.test(subtype)) return "Gyms";
  if (/\u0430\u043f\u0442\u0435\u043a/.test(subtype)) return "Pharmacies";
  if (/\u043a\u043b\u0438\u043d\u0438\u043a|\u0431\u043e\u043b\u044c\u043d\u0438\u0446|\u043c\u0435\u0434\u0438\u0446\u0438\u043d/.test(subtype)) return "Clinics";
  if (/\u0441\u0430\u043b\u043e\u043d|\u043a\u0440\u0430\u0441\u043e\u0442|\u043f\u0430\u0440\u0438\u043a\u043c\u0430\u0445\u0435\u0440/.test(subtype)) return "Salons";
  if (/\u043a\u0438\u043d\u043e\u0442\u0435\u0430\u0442\u0440|\u043c\u0443\u0437\u0435\u0439|\u0440\u0430\u0437\u0432\u043b\u0435\u0447/.test(subtype)) return "Entertainment";
  if (/\u043c\u0430\u0433\u0430\u0437\u0438\u043d|\u0442\u043e\u0440\u0433\u043e\u0432/.test(subtype)) return "Shops";
  if (/restaurant/.test(subtype)) return "Restaurants";
  if (/cafe|fast_food|coffee/.test(subtype)) return "Cafes";
  if (/pharmacy|chemist/.test(subtype)) return "Pharmacies";
  if (/clinic|doctor|hospital/.test(subtype)) return "Clinics";
  if (/fitness|sports_centre|gym/.test(subtype)) return "Gyms";
  if (/beauty|hairdresser|barber/.test(subtype)) return "Salons";
  if (/entertainment|cinema|theatre|arts_centre|museum|bowling|nightclub/.test(subtype)) return "Entertainment";
  return "Other";
}

async function throttleExternal() {
  const now = Date.now();
  const wait = Math.max(0, nextExternalRequestAt - now);
  nextExternalRequestAt = Math.max(now, nextExternalRequestAt) + REQUEST_GAP_MS;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
}

function invalidateGeographicCache(category) {
  for (const key of cache.keys()) {
    let cachedCategory = null;
    try { cachedCategory = JSON.parse(key)[0]; } catch { continue; }
    if (!category || cachedCategory === category || cachedCategory === "all") cache.delete(key);
  }
}

async function discoverGeographicRecords({ category, center = AKTAU, radiusKm = 10, query = "", page = 1, signal }) {
  const safeRadius = Math.max(1, Math.min(25, Number(radiusKm) || 10));
  const safeQuery = String(query || "").trim().slice(0, 160);
  const safePage = Math.max(1, Math.min(5, Math.floor(Number(page) || 1)));
  const key = JSON.stringify([category || "all", Number(center.lat).toFixed(3), Number(center.lng).toFixed(3), safeRadius, safeQuery.toLocaleLowerCase(), safePage]);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cache: "hit" };
  const settled = await Promise.allSettled(Object.values(adapters).map((adapter) => adapter.list({ category, center, radiusKm: safeRadius, query: safeQuery, page: safePage, signal })));
  const records = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const externalFailed = settled.slice(0, 4).some((result) => result.status === "rejected");
  if (externalFailed && cached?.value?.items?.length) {
    records.push(...cached.value.items.filter((item) => item.source !== "demo"));
  }
  const byId = new Map(records.map((record) => [record.id, record]));
  const items = [...byId.values()].filter((record) => record.distanceKm <= safeRadius)
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  const geoPageResult = settled[0]?.status === "fulfilled" ? settled[0].value : null;
  const value = { items, page: safePage, pageSize: Number(process.env.TWOGIS_PAGE_SIZE) || 50, pageLimit: 5, hasMore: Boolean(geoPageResult?.hasMore), total: Number(geoPageResult?.total) || items.length, sourceErrors: { twogis: settled[0]?.status === "rejected" ? String(settled[0].reason?.message || "2GIS unavailable") : null }, sources: Object.values(adapters).map((adapter) => adapter.name), fetchedAt: new Date().toISOString(), attribution: "© OpenStreetMap contributors", staleSourceFallback: externalFailed && Boolean(cached?.value) };
  value.providerCache = geoPageResult?.providerCache || null;
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return { ...value, cache: externalFailed && cached?.value ? "stale" : "miss" };
}

function geocodeAktau(query) {
  const safeQuery = String(query || "").trim().slice(0, 160);
  if (!safeQuery) return Promise.resolve(null);
  const key = `geocode:${safeQuery.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
  return throttleExternal().then(async () => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({ q: `${safeQuery}, Aktau, Kazakhstan`, format: "jsonv2", limit: "1", countrycodes: "kz" });
    const response = await fetch(url, { headers: { "User-Agent": "TezTap/1.0 (Aktau discovery app)", "Accept-Language": "ru" }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
    const [item] = await response.json();
    const value = item ? { coordinates: { lat: Number(item.lat), lng: Number(item.lon) }, address: item.display_name, source: "openstreetmap", sourceLabel: "OpenStreetMap · Nominatim" } : null;
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  });
}

async function reverseGeocodeAktau(coordinates) {
  if (!validCoordinates(coordinates)) throw new Error("Invalid coordinates");
  const key = `reverse:${Number(coordinates.lat).toFixed(5)}:${Number(coordinates.lng).toFixed(5)}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  await throttleExternal();
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.search = new URLSearchParams({ lat: String(coordinates.lat), lon: String(coordinates.lng), format: "jsonv2", zoom: "18", addressdetails: "1" });
  const response = await fetch(url, { headers: { "User-Agent": "TezTap/1.0 (Aktau discovery app)", "Accept-Language": "ru" }, signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
  const item = await response.json();
  const parts = item.address || {};
  const value = {
    coordinates: { lat: Number(item.lat), lng: Number(item.lon) }, address: item.display_name || "Рядом в Актау",
    districtId: parts.suburb || parts.city_district || parts.neighbourhood || null,
    source: "openstreetmap", sourceLabel: "OpenStreetMap · Nominatim"
  };
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

module.exports = { AKTAU, adapters, discoverGeographicRecords, geocodeAktau, reverseGeocodeAktau, normalizeRecord, normalize2GISEducation, haversineKm, invalidateGeographicCache };
