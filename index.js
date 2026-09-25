require("./services/env").loadEnv();

const express = require("express");
const cors = require("cors");
const { analyzeBusiness } = require("./services/analysis");
const { buildBestAreaAnalysis } = require("./services/areaFinder");
const { getOptions } = require("./data/competitors");
const {
  initializeDatabase,
  getDatabaseStatus,
  saveAnalysis,
  saveCityEconomicIndicatorSnapshot,
  listAnalyses,
  listCityEconomicIndicators,
  listCommercialProperties,
  getCommercialProperty,
  getAnalysisById,
  listAccessUsers,
  updateUserAccess,
  requestSubscription,
  updateUserProfile,
  getUserWorkspace,
  saveUserWorkspace
} = require("./services/database");
const { validateWorkspace, validateProfile } = require("./services/workspace");
const { registerUser, loginUser, authenticateRequest } = require("./services/auth");
const { requireFeature, projectAnalysis, basicCompetitors } = require("./services/access");
const { getAccess, FEATURE_PLANS, PLAN_FEATURES, canAccessFeature } = require("./shared/access");
const { createChatReply, streamChatReply } = require("./services/ai");
const { normalizeChatPayload } = require("./services/ai/chatService");
const { AKTAU, discoverGeographicRecords, geocodeAktau, reverseGeocodeAktau, invalidateGeographicCache, normalize2GISEducation, normalizeRecord } = require("./services/geographicData");
const neighborhood = require("./services/neighborhood");
const { submitEducationListing, listPublicEducationListings } = require("./services/educationListings");
const { search2GISBusinesses } = require("./services/twogis");
const { submitJobListing, listPublicJobListings } = require("./services/jobListings");
const { buildInvestorReport } = require("./services/export");
const { getCompetitorSnapshot, getPriceSnapshot } = require("./services/marketSnapshot");
const {
  createUserPlannedBusiness,
  listUserPlannedBusinesses,
  listPublicPlannedBusinesses,
  updateUserPlannedBusiness,
  cancelUserPlannedBusiness,
  buildProjectedAnalytics
} = require("./services/plannedBusinesses");
const {
  listPublicProperties,
  createOwnerProperty,
  updateOwnerProperty,
  moderateProperty,
  buildPropertyRecommendations
} = require("./services/properties");
const {
  createUserPriceObservation,
  listVerifiedPriceObservations,
  listUserPriceObservations,
  reviewPriceObservation
} = require("./services/priceObservations");
const {
  validateAnalysisContract,
  validateCompetitorSnapshotContract,
  validatePriceSnapshotContract,
  validateReportContract
} = require("./services/contracts");

const app = express();
const port = process.env.PORT || 5000;
const frontendPort = process.env.FRONTEND_PORT || 3000;
const frontendRoutes = new Set([
  "/assistant",
  "/map",
  "/investors",
  "/reports",
  "/history",
  "/areas",
  "/opportunities",
  "/franchise",
  "/banks",
  "/government",
  "/economic"
]);

const allowedOrigins = new Set(String(process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean));
app.use(cors({
  origin(origin, callback) {
    if (!origin || process.env.NODE_ENV !== "production" || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  }
}));
app.use(express.json({ limit: "4mb" }));

const requestBuckets = new Map();
const API_RATE_WINDOW_MS = Number(process.env.API_RATE_WINDOW_MS || 60000);
const API_RATE_LIMIT = Number(process.env.API_RATE_LIMIT || 90);

app.use((req, res, next) => {
  if (!req.path.startsWith("/api/") && !["/chat", "/chat/stream", "/analyze", "/analyze-market", "/competitors", "/prices"].includes(req.path)) return next();
  if (req.path === "/health" || req.path === "/options") {
    return next();
  }

  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = requestBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + API_RATE_WINDOW_MS });
    return next();
  }

  bucket.count += 1;

  if (bucket.count > API_RATE_LIMIT) {
    res.set("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
    return res.status(429).json({ error: "Too many requests. Please try again shortly." });
  }

  return next();
});

app.use(async (req, _res, next) => {
  try {
    req.user = await authenticateRequest(req);
    next();
  } catch (error) {
    next(error);
  }
});

const endpointPermissions = [
  [/^\/(?:api\/)?(?:analyze|analyze-market)$/, "BASIC_ANALYSIS", true],
  [/^\/api\/area-analysis\/best$/, "BEST_DISTRICT_FINDER"],
  [/^\/(?:api\/)?competitors$/, "SMART_MAP", true],
  [/^\/(?:api\/)?chat(?:\/stream)?$/, "AI_ADVISOR"],
  [/^\/(?:api\/)?prices$/, "PRICING"],
  [/^\/api\/price-observations\/[^/]+\/moderate$/, "ADMIN_TOOLS"],
  [/^\/api\/price-observations$/, "PRICING"],
  [/^\/api\/planned-businesses(?:\/[^/]+)?$/, "PLANNED_BUSINESS"],
  [/^\/api\/(?:market-pressure|projected-analytics|opportunity-alternatives)$/, "FUTURE_MARKET_PRESSURE"],
  [/^\/api\/properties\/[^/]+\/moderate$/, "ADMIN_TOOLS"],
  [/^\/api\/properties(?:\/[^/]+)?$/, "COMMERCIAL_PROPERTIES"],
  [/^\/api\/education\/listings$/, "BASIC_ANALYSIS"],
  [/^\/api\/jobs\/listings$/, "BASIC_ANALYSIS"],
  [/^\/api\/export\/report(?:\/html)?$/, "EXPORT"],
  [/^\/api\/city-indicators$/, "ENTERPRISE_TOOLS"],
  [/^\/api\/analyses$/, "MULTIPLE_PROJECTS"],
  [/^\/api\/analyses\/[^/]+$/, "BASIC_ANALYSIS"],
  [/^\/api\/(?:me|me\/profile|subscription-requests|workspace)$/, "BASIC_ANALYSIS"],
  [/^\/api\/admin\/users(?:\/[^/]+)?$/, "ADMIN_TOOLS"]
];

app.use((req, res, next) => {
  const pathname = req.path.toLowerCase().replace(/\/+$/, "");
  if (pathname.startsWith("/api/neighborhood/")) {
    if (req.method === "GET" && (pathname === "/api/neighborhood/locations" || pathname === "/api/neighborhood/issues" || /^\/api\/neighborhood\/communities\/[^/]+$/.test(pathname))) return next();
    if (!req.user?.id) return res.status(401).json({ error: "Войдите в аккаунт TezTap." });
    return next();
  }
  const publicRead = req.method === "GET" && ["", "/api/health", "/api/options", "/api/access", "/api/discovery", "/api/geocode", "/api/education/listings", "/api/education/2gis", "/api/jobs/listings"].includes(pathname);
  const publicAuth = req.method === "POST" && ["/api/auth/login", "/api/auth/register"].includes(pathname);
  if (publicRead || publicAuth) return next();
  const rule = endpointPermissions.find(([pattern]) => pattern.test(pathname));
  if (rule) return requireFeature(rule[1], { anonymous: rule[2] === true })(req, res, next);
  if (pathname.startsWith("/api/")) return res.status(404).json({ error: "Endpoint not found" });
  return next();
});

app.get("/api/access", (req, res) => {
  res.set("Cache-Control", "private, no-store");
  res.json({
    user: req.user,
    access: getAccess(req.user),
    demoSubscription: process.env.MERCORA_DEMO_MODE === "true",
    featurePlans: FEATURE_PLANS,
    planFeatures: PLAN_FEATURES
  });
});

app.post("/api/subscription-requests", async (req, res, next) => {
  try {
    const request = await requestSubscription({ userId: req.user.id, plan: req.body?.plan });
    res.status(202).json(request);
  } catch (error) { next(error); }
});

app.get("/api/admin/users", async (req, res, next) => {
  const offset = Number(req.query.offset || 0);
  const limit = Number(req.query.limit || 50);
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: "Invalid pagination", code: "INVALID_REQUEST" });
  }
  try { res.json({ users: await listAccessUsers({ limit, offset }) }); }
  catch (error) { next(error); }
});

app.patch("/api/admin/users/:id", async (req, res, next) => {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(req.params.id)) return res.status(400).json({ error: "Invalid user id" });
  try {
    res.json({ user: await updateUserAccess({ userId: req.params.id, actorId: req.user.id, updates: req.body }) });
  } catch (error) { next(error); }
});

app.get("/api/analyses/:id", async (req, res, next) => {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(req.params.id)) return res.status(400).json({ error: "Invalid analysis id" });
  try {
    const analysis = await getAnalysisById({ id: req.params.id, userId: req.user.id });
    if (!analysis) return res.status(404).json({ error: "Analysis not found" });
    res.json({ ...projectAnalysis(analysis.result, req.user), analysisId: analysis.id });
  } catch (error) { next(error); }
});

app.get("/", (_req, res) => {
  res.json({
    name: "TezTap Map Analytics API",
    status: "ok",
    endpoints: [
      "GET /api/health",
      "GET /api/options",
      "POST /api/auth/register",
      "POST /api/auth/login",
      "GET /api/discovery",
      "GET /api/neighborhood/locations",
      "GET /api/neighborhood/communities/:id",
      "GET /api/geocode",
      "GET /api/education/listings",
      "POST /api/education/listings",
      "GET /api/jobs/listings",
      "POST /api/jobs/listings",
      "GET /api/me",
      "GET /api/analyses",
      "GET /api/city-indicators",
      "POST /api/analyze",
      "POST /api/analyze-market",
      "POST /api/area-analysis/best",
      "POST /api/chat",
      "POST /api/chat/stream",
      "GET /api/competitors",
      "GET /api/prices",
      "POST /api/price-observations",
      "GET /api/price-observations",
      "POST /api/price-observations/:id/moderate",
      "POST /api/planned-businesses",
      "GET /api/planned-businesses",
      "GET /api/planned-businesses/:id",
      "PATCH /api/planned-businesses/:id",
      "DELETE /api/planned-businesses/:id",
      "GET /api/market-pressure",
      "POST /api/projected-analytics",
      "POST /api/opportunity-alternatives",
      "POST /api/export/report",
      "POST /api/export/report/html"
    ]
  });
});

app.get("/api/health", async (_req, res) => {
  const database = await initializeDatabase();

  res.json({
    status: "ok",
    service: "TezTap",
    database,
    ai: {
      provider: process.env.GEMINI_API_KEY ? "gemini" : "local fallback",
      model: process.env.GEMINI_API_KEY ? process.env.GEMINI_MODEL || "gemini-flash-lite-latest" : "local-analysis-rules"
    },
    timestamp: new Date().toISOString()
  });
});

app.get("/api/options", (_req, res) => {
  res.json(getOptions());
});

app.get("/api/discovery", async (req, res) => {
  const categories = new Set(["all", "education", "jobs", "services", "marketplace", "places"]);
  const category = String(req.query.category || "all");
  const center = { lat: Number(req.query.lat ?? AKTAU.lat), lng: Number(req.query.lng ?? AKTAU.lng) };
  const radiusKm = Number(req.query.radiusKm || 10);
  if (!categories.has(category) || !Number.isFinite(center.lat) || Math.abs(center.lat) > 90 || !Number.isFinite(center.lng) || Math.abs(center.lng) > 180 || !Number.isFinite(radiusKm)) {
    return res.status(400).json({ error: "Invalid geographic search parameters" });
  }
  try {
    const data = await discoverGeographicRecords({ category, center, radiusKm, query: String(req.query.query || "").slice(0, 160) });
    res.set("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
    res.json({ ...data, center, radiusKm: Math.max(1, Math.min(25, radiusKm)) });
  } catch (error) {
    res.status(503).json({ error: "Geographic sources are temporarily unavailable", detail: error.message });
  }
});

app.get("/api/neighborhood/locations", async (req, res, next) => {
  try { res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300"); res.json(await neighborhood.listLocations({ query: req.query.q })); }
  catch (error) { next(error); }
});

app.get("/api/neighborhood/issues", async (req, res, next) => {
  try { res.set("Cache-Control", "public, max-age=15, stale-while-revalidate=60"); res.json(await neighborhood.listCityIssues({ category: req.query.category })); }
  catch (error) { next(error); }
});

app.get("/api/neighborhood/communities/:id", async (req, res, next) => {
  try { res.set("Cache-Control", "public, max-age=30"); res.json(await neighborhood.getCommunity(req.params.id)); }
  catch (error) { next(error); }
});

app.get("/api/neighborhood/my", async (req, res, next) => {
  try { res.set("Cache-Control", "private, no-store"); res.json(await neighborhood.getMyNeighborhood(req.user)); }
  catch (error) { next(error); }
});

app.put("/api/neighborhood/follows/:id", async (req, res, next) => {
  try { res.json(await neighborhood.followLocation(req.user, req.params.id, req.body || {})); }
  catch (error) { next(error); }
});

app.put("/api/neighborhood/issue-subscriptions/:category", async (req, res, next) => {
  try { res.json(await neighborhood.followIssueCategory(req.user, req.params.category, req.body?.follow !== false)); }
  catch (error) { next(error); }
});

app.post("/api/neighborhood/locations/suggestions", async (req, res, next) => {
  try { res.status(202).json(await neighborhood.suggestLocation(req.user, req.body || {})); }
  catch (error) { next(error); }
});

app.post("/api/neighborhood/roles/applications", async (req, res, next) => {
  try { res.status(202).json(await neighborhood.applyForRole(req.user, req.body || {})); }
  catch (error) { next(error); }
});

app.post("/api/neighborhood/announcements", async (req, res, next) => {
  try { res.status(201).json(await neighborhood.publishAnnouncement(req.user, req.body || {})); }
  catch (error) { next(error); }
});

app.post("/api/neighborhood/reports", async (req, res, next) => {
  try { res.status(201).json(await neighborhood.publishAnnouncement(req.user, req.body || {}, { residentReport: true })); }
  catch (error) { next(error); }
});

app.post("/api/neighborhood/reports/:id/confirm", async (req, res, next) => {
  try { res.json(await neighborhood.confirmResidentReport(req.user, req.params.id)); }
  catch (error) { next(error); }
});

app.post("/api/neighborhood/events", async (req, res, next) => {
  try { res.status(201).json(await neighborhood.createEvent(req.user, req.body || {})); }
  catch (error) { next(error); }
});

app.put("/api/neighborhood/events/:id/rsvp", async (req, res, next) => {
  try { res.json(await neighborhood.rsvpEvent(req.user, req.params.id, req.body?.attending === true)); }
  catch (error) { next(error); }
});

app.post("/api/neighborhood/discussions", async (req, res, next) => {
  try { res.status(201).json(await neighborhood.createDiscussion(req.user, req.body || {})); }
  catch (error) { next(error); }
});

app.get("/api/neighborhood/moderation", async (req, res, next) => {
  try { res.set("Cache-Control", "private, no-store"); res.json(await neighborhood.getModerationQueue(req.user)); }
  catch (error) { next(error); }
});

app.patch("/api/neighborhood/moderation/:kind/:id", async (req, res, next) => {
  try { res.json(await neighborhood.moderateItem(req.user, req.params.kind, req.params.id, req.body?.decision)); }
  catch (error) { next(error); }
});

app.patch("/api/neighborhood/notifications/:id/read", async (req, res, next) => {
  try { res.json(await neighborhood.markNeighborhoodNotificationRead(req.user, req.params.id)); }
  catch (error) { next(error); }
});

app.get("/api/education/listings", async (req, res, next) => {
  try {
    const items = await listPublicEducationListings({ city: "Актау", limit: 200 });
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({ items });
  } catch (error) { next(error); }
});

app.get("/api/education/2gis", async (req, res, next) => {
  const query = String(req.query.q || "").trim().slice(0, 160);
  if (query.length < 2) return res.status(400).json({ error: "Введите направление или тип обучения." });
  try {
    const result = await search2GISBusinesses({ query, center: AKTAU, radiusKm: 25, sort: "rating", branchOnly: true, minRating: 3.5 });
    const userItems = (await listPublicEducationListings({ city: "Актау", limit: 200 })).map((item) => normalizeRecord(item, { center: AKTAU, source: "user_generated", sourceLabel: "Объявление пользователя · не проверено" })).filter(Boolean);
    const items = result.items.map((item) => normalize2GISEducation(item, AKTAU)).filter(Boolean);
    res.set("Cache-Control", "no-store");
    res.json({ ...result, items, total: items.length, page: 1, pageSize: items.length, pageLimit: 1, hasMore: false, userItems, center: AKTAU, radiusKm: 25, minRating: 3.5, attribution: "Данные предоставлены 2ГИС", attributionUrl: "https://2gis.kz/aktau" });
  } catch (error) {
    res.status(502).json({ error: "2ГИС временно не ответил на поиск обучения.", detail: error.status || null });
  }
});

app.post("/api/education/listings", async (req, res, next) => {
  try {
    const listing = await submitEducationListing({ user: req.user, payload: req.body || {} });
    invalidateGeographicCache("education");
    res.status(201).json({ listing });
  } catch (error) { next(error); }
});

app.get("/api/jobs/listings", async (_req, res, next) => {
  try {
    const items = await listPublicJobListings({ city: "Актау", limit: 200 });
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({ items });
  } catch (error) { next(error); }
});

app.post("/api/jobs/listings", async (req, res, next) => {
  try {
    const listing = await submitJobListing({ user: req.user, payload: req.body || {} });
    invalidateGeographicCache("jobs");
    res.status(201).json({ listing });
  } catch (error) { next(error); }
});

app.get("/api/geocode", async (req, res) => {
  if (req.query.lat != null || req.query.lng != null) {
    const coordinates = { lat: Number(req.query.lat), lng: Number(req.query.lng) };
    if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng) || Math.abs(coordinates.lat) > 90 || Math.abs(coordinates.lng) > 180) return res.status(400).json({ error: "Invalid coordinates" });
    try {
      const location = await reverseGeocodeAktau(coordinates);
      res.set("Cache-Control", "private, max-age=300, stale-while-revalidate=900");
      return res.json(location);
    } catch {
      return res.status(503).json({ error: "OpenStreetMap reverse geocoding is temporarily unavailable" });
    }
  }
  const query = String(req.query.q || "").trim();
  if (query.length < 2 || query.length > 160) return res.status(400).json({ error: "Enter an Aktau address or area" });
  try {
    const location = await geocodeAktau(query);
    if (!location) return res.status(404).json({ error: "Location was not found" });
    res.set("Cache-Control", "private, max-age=300, stale-while-revalidate=900");
    res.json(location);
  } catch {
    res.status(503).json({ error: "OpenStreetMap geocoding is temporarily unavailable" });
  }
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const session = await registerUser(req.body || {});
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const session = await loginUser(req.body || {});
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  return res.json({ user: req.user, access: getAccess(req.user), database: getDatabaseStatus() });
});

app.patch("/api/me/profile", async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const profile = validateProfile(req.body || {});
    const user = await updateUserProfile({ userId: req.user.id, ...profile });
    if (!user) return res.status(404).json({ error: "Account not found" });
    res.json({ user });
  } catch (error) { next(error); }
});

app.get("/api/workspace", async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const workspace = validateWorkspace(await getUserWorkspace({ userId: req.user.id }));
    res.set("Cache-Control", "private, no-store");
    res.json({ workspace });
  } catch (error) { next(error); }
});

app.put("/api/workspace", async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const workspace = validateWorkspace(req.body || {});
    const saved = await saveUserWorkspace({ userId: req.user.id, state: workspace });
    res.set("Cache-Control", "private, no-store");
    res.json({ workspace: saved });
  } catch (error) { next(error); }
});

app.get("/api/analyses", async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const analyses = await listAnalyses({ userId: req.user.id, limit: Number(req.query.limit) || 12 });
    res.json({ analyses: analyses.map((analysis) => ({ ...analysis, result: projectAnalysis(analysis.result, req.user) })) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/city-indicators", async (req, res, next) => {
  const { city, businessType } = req.query || {};

  if (!city || typeof city !== "string") {
    return res.status(400).json({ error: "city query parameter is required" });
  }

  try {
    const indicators = await listCityEconomicIndicators({
      city,
      businessType: typeof businessType === "string" && businessType ? businessType : null,
      limit: Number(req.query.limit) || 24
    });

    res.json({
      city,
      businessType: businessType || null,
      indicators,
      state: indicators.length ? "ready" : "empty",
      message: indicators.length ? "Historical city indicators returned from saved analyses." : "No historical city indicators exist yet. Run analysis to create real history."
    });
  } catch (error) {
    next(error);
  }
});

app.post(["/api/analyze", "/api/analyze-market", "/analyze", "/analyze-market"], async (req, res, next) => {
  const { city, budget, businessType, country, preferredLocation, targetAudience, businessFormat } = req.body || {};
  const validationError = validateAnalyzeRequest({ city, budget, businessType });

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const result = await analyzeBusiness({ city, budget: Number(budget), businessType, country, preferredLocation, targetAudience, businessFormat });
    assertContract("Analysis", validateAnalysisContract(result));
    let analysisId = null;

    if (req.user) {
      analysisId = await saveAnalysis({
        userId: req.user.id,
        input: { city, budget: Number(budget), businessType, country: country || "Kazakhstan", preferredLocation: preferredLocation || null, targetAudience: targetAudience || null, businessFormat: businessFormat || null },
        result
      });
    }

    await saveCityEconomicIndicatorSnapshot({
      analysisId,
      userId: req.user?.id || null,
      input: { city, budget: Number(budget), businessType, country: country || "Kazakhstan", preferredLocation: preferredLocation || null, targetAudience: targetAudience || null, businessFormat: businessFormat || null },
      result
    });

    res.json({
      ...projectAnalysis(result, req.user),
      analysisId,
      account: {
        saved: Boolean(analysisId),
        user: req.user || null
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/area-analysis/best", async (req, res, next) => {
  const { city, budget, businessType, country, preferredLocation, targetAudience, businessFormat } = req.body || {};
  const validationError = validateAnalyzeRequest({ city, budget, businessType });

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const input = {
      city,
      budget: Number(budget),
      businessType,
      country: country || "Kazakhstan",
      preferredLocation: preferredLocation || null,
      targetAudience: targetAudience || null,
      businessFormat: businessFormat || null
    };
    const analysis = await analyzeBusiness(input);
    assertContract("Analysis", validateAnalysisContract(analysis));
    const bestAreaFinder = buildBestAreaAnalysis({ analysis });
    const storedResult = { ...analysis, bestAreaFinder };
    const analysisId = await saveAnalysis({ userId: req.user.id, input, result: storedResult });

    res.json({ ...bestAreaFinder, analysisId });
  } catch (error) {
    next(error);
  }
});

app.get(["/api/competitors", "/competitors"], async (req, res, next) => {
  const { city, businessType } = req.query || {};
  const validationError = validateMarketQuery({ city, businessType });

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const snapshot = await getCompetitorSnapshot({ city, businessType });
    assertContract("Competitor snapshot", validateCompetitorSnapshotContract(snapshot));

    const basic = !canAccessFeature(req.user, "ADVANCED_COMPETITION");
    res.json({
      competitors: basic ? basicCompetitors(snapshot.competitors) : snapshot.competitors,
      market: basic ? projectAnalysis({ competitors: snapshot.competitors, market: snapshot.market }, req.user).market : snapshot.market,
      sources: snapshot.sources,
      generatedAt: snapshot.generatedAt,
      dataVersion: snapshot.dataVersion
    });
  } catch (error) {
    next(error);
  }
});

app.get(["/api/prices", "/prices"], async (req, res, next) => {
  const { city, businessType } = req.query || {};
  const validationError = validateMarketQuery({ city, businessType });

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const snapshot = await getPriceSnapshot({ city, businessType });
    assertContract("Price snapshot", validatePriceSnapshotContract(snapshot));

    res.json({
      prices: snapshot.prices,
      stats: snapshot.stats,
      profile: snapshot.profile,
      sources: snapshot.sources.prices,
      generatedAt: snapshot.generatedAt,
      dataVersion: snapshot.dataVersion
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/price-observations", async (req, res, next) => {
  try {
    const observation = await createUserPriceObservation({ user: req.user, payload: req.body || {} });
    res.status(201).json({ observation });
  } catch (error) {
    next(error);
  }
});

app.get("/api/price-observations", async (req, res, next) => {
  try {
    if (req.query.mine === "true") {
      const observations = await listUserPriceObservations({
        user: req.user,
        city: req.query.city,
        businessType: req.query.businessType
      });
      return res.json({ observations });
    }

    const observations = await listVerifiedPriceObservations({
      city: req.query.city,
      businessType: req.query.businessType
    });
    return res.json({ observations });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/price-observations/:id/moderate", async (req, res, next) => {
  try {
    const observation = await reviewPriceObservation({ user: req.user, id: req.params.id, status: req.body?.status });
    res.json({ observation });
  } catch (error) {
    next(error);
  }
});

app.post("/api/planned-businesses", async (req, res, next) => {
  try {
    const plannedBusiness = await createUserPlannedBusiness({ user: req.user, payload: req.body || {} });
    res.status(201).json({ plannedBusiness });
  } catch (error) {
    next(error);
  }
});

app.get("/api/planned-businesses", async (req, res, next) => {
  try {
    if (req.query.mine === "true") {
      return res.json({ plannedBusinesses: await listUserPlannedBusinesses({ user: req.user }) });
    }

    const plannedBusinesses = await listPublicPlannedBusinesses({
      city: req.query.city,
      category: req.query.category,
      status: req.query.status || ["PLANNED", "VERIFIED", "OPEN"]
    });
    return res.json({ plannedBusinesses });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/planned-businesses/:id", async (req, res, next) => {
  try {
    const plannedBusinesses = await listUserPlannedBusinesses({ user: req.user });
    const plannedBusiness = plannedBusinesses.find((item) => item.id === req.params.id);

    if (!plannedBusiness) {
      return res.status(404).json({ error: "Planned business not found" });
    }

    return res.json({ plannedBusiness });
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/planned-businesses/:id", async (req, res, next) => {
  try {
    const plannedBusiness = await updateUserPlannedBusiness({ user: req.user, id: req.params.id, payload: req.body || {} });
    res.json({ plannedBusiness });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/planned-businesses/:id", async (req, res, next) => {
  try {
    const plannedBusiness = await cancelUserPlannedBusiness({ user: req.user, id: req.params.id });
    res.json({ plannedBusiness });
  } catch (error) {
    next(error);
  }
});

app.get("/api/properties", async (req, res, next) => {
  try {
    if (req.query.mine === "true") {
      if (!req.user?.id) return res.status(401).json({ error: "Authentication required" });
      return res.json({ properties: await listCommercialProperties({ ownerId: req.user.id, includePrivate: true, status: ["PENDING", "VERIFIED", "ACTIVE", "INACTIVE", "RENTED", "SOLD", "REJECTED"], limit: 100 }) });
    }
    return res.json({ properties: await listPublicProperties({
      city: req.query.city,
      transactionType: req.query.transactionType || req.query.transaction_type,
      propertyType: req.query.propertyType || req.query.property_type,
      districtId: req.query.districtId || req.query.district_id,
      limit: req.query.limit
    }) });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/properties", async (req, res, next) => {
  try {
    const property = await createOwnerProperty({ user: req.user, payload: req.body || {} });
    return res.status(201).json({ property });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/properties/:id", async (req, res, next) => {
  try {
    const property = await getCommercialProperty({ id: req.params.id, includePrivate: false });
    if (!property || !["ACTIVE", "VERIFIED"].includes(property.status)) return res.status(404).json({ error: "Commercial property not found" });
    return res.json({ property });
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/properties/:id", async (req, res, next) => {
  try {
    const property = await updateOwnerProperty({ user: req.user, id: req.params.id, payload: req.body || {} });
    return res.json({ property });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/properties/:id/moderate", async (req, res, next) => {
  try {
    const property = await moderateProperty({ user: req.user, id: req.params.id, status: req.body?.status });
    return res.json({ property });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/properties/recommendations", async (req, res, next) => {
  try {
    return res.json(await buildPropertyRecommendations({ analysis: req.body?.analysis, filters: req.body?.filters || {} }));
  } catch (error) {
    return next(error);
  }
});

app.get("/api/market-pressure", async (req, res, next) => {
  try {
    const plannedBusinesses = await listPublicPlannedBusinesses({
      city: req.query.city,
      category: req.query.category || req.query.businessType,
      status: ["PLANNED", "VERIFIED", "OPEN"]
    });
    res.json({
      plannedBusinesses,
      summary: {
        planned: plannedBusinesses.filter((item) => item.status === "PLANNED").length,
        verified: plannedBusinesses.filter((item) => item.status === "VERIFIED").length,
        open: plannedBusinesses.filter((item) => item.status === "OPEN").length
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projected-analytics", async (req, res, next) => {
  try {
    res.json(await buildProjectedAnalytics({
      analysis: req.body?.analysis,
      city: req.body?.city,
      category: req.body?.category || req.body?.businessType
    }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/opportunity-alternatives", async (req, res, next) => {
  try {
    const projected = await buildProjectedAnalytics({
      analysis: req.body?.analysis,
      city: req.body?.city,
      category: req.body?.category || req.body?.businessType
    });
    res.json({
      alternativeOpportunity: projected.projectedMarket.alternativeOpportunity,
      congestion: projected.projectedMarket.congestion,
      projectedMarket: projected.projectedMarket
    });
  } catch (error) {
    next(error);
  }
});

app.post(["/api/chat", "/chat"], async (req, res, next) => {
  try {
    const chatPayload = normalizeChatPayload(req.body || {});
    const result = await createChatReply({
      messages: chatPayload.messages,
      analysis: chatPayload.analysis,
      language: chatPayload.language,
      analysisId: chatPayload.analysisId,
      requestContext: chatPayload.requestContext,
      user: req.user
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post(["/api/chat/stream", "/chat/stream"], async (req, res) => {
  const chatPayload = normalizeChatPayload(req.body || {});
  await streamChatReply({
    res,
    messages: chatPayload.messages,
    analysis: chatPayload.analysis,
    language: chatPayload.language,
    analysisId: chatPayload.analysisId,
    requestContext: chatPayload.requestContext,
    user: req.user
  });
});

app.post("/api/export/report", (req, res, next) => {
  try {
    const report = buildInvestorReport({ analysis: req.body?.analysis });
    assertContract("Report", validateReportContract(report));
    res.json(report);
  } catch (error) {
    next(error);
  }
});

app.post("/api/export/report/html", (req, res, next) => {
  try {
    const report = buildInvestorReport({ analysis: req.body?.analysis });
    assertContract("Report", validateReportContract(report));
    res.type("html").send(report.printHtml || "");
  } catch (error) {
    next(error);
  }
});

app.get(Array.from(frontendRoutes), (req, res) => {
  const host = req.hostname || "localhost";
  res.redirect(302, `http://${host}:${frontendPort}${req.originalUrl}`);
});

app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

app.use((error, _req, res, _next) => {
  if (!error.status || error.status >= 500) {
    console.error(error);
  }
  res.status(error.status || 500).json({
    error: error.status ? error.message : "Internal server error",
    code: error.code,
    details: error.status && error.details ? error.details : undefined
  });
});

if (require.main === module) {
  initializeDatabase().then(() => {
    app.listen(port, () => {
      console.log(`TezTap Map Analytics backend running on http://localhost:${port}`);
    });
  }).catch(() => {
    console.error("Database initialization failed; backend was not started.");
    process.exitCode = 1;
  });
}

function validateAnalyzeRequest({ city, budget, businessType }) {
  if (!city || typeof city !== "string") {
    return "city is required and must be a string";
  }

  if (!Number.isFinite(Number(budget)) || Number(budget) <= 0) {
    return "budget is required and must be a positive number";
  }

  if (!businessType || typeof businessType !== "string") {
    return "businessType is required and must be a string";
  }

  return null;
}

function validateMarketQuery({ city, businessType }) {
  if (!city || typeof city !== "string") {
    return "city query parameter is required";
  }

  if (!businessType || typeof businessType !== "string") {
    return "businessType query parameter is required";
  }

  return null;
}

function assertContract(label, missingFields) {
  if (!missingFields.length) {
    return;
  }

  const error = new Error(`${label} contract failed: missing ${missingFields.join(", ")}`);
  error.status = 500;
  throw error;
}

module.exports = app;
