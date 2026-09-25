const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const crypto = require("node:crypto");

// Isolated memory database and provider fixtures; never contact production services.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.AUTH_SECRET = crypto.randomBytes(48).toString("hex");
process.env.GEMINI_API_KEY = "";
process.env.API_RATE_LIMIT = "10000";

const policy = require("../shared/access");
const { projectAnalysis } = require("../services/access");
const database = require("../services/database");
const { buildAnalyticsContext } = require("../services/ai/analyticsContext");
const { saveConversationMessage, loadConversationMemory } = require("../services/ai/memoryManager");
const fixture = {
  input: { city: "Aktau", businessType: "coffee_shop", budget: 15000000 },
  profile: { title: "Coffee shop" },
  competitors: [{ id: "fixture", name: "Test record", address: "Test address", area: "Test area", category: "Coffee", coordinates: { lat: 43.65, lng: 51.17 }, rating: 4.5, priceSamples: [{ price: 1200 }] }],
  prices: [], stats: {}, market: { competitorCount: 1, areaCounts: { "Test area": 1 }, density: "low" },
  analytics: { competitorCount: 1, breakEvenTransactions: 1234 }, charts: { profitabilityProjection: [{ revenue: 999 }] },
  budgetPlan: { inputBudget: 15000000, budgetRealismScore: 60, breakEvenTransactions: 1234 },
  recommendation: { bestArea: "Test area" }, opportunityScore: { score: 60, factors: {} },
  probability: { successProbability: 50, assumptions: {} }, districtMetrics: [],
  proprietaryScoring: { scores: {} }, opportunityDiscovery: {}, marketGapEngine: {},
  cityEconomicIndicator: { city: "Aktau", compositeScore: 10 }, investmentModule: {}, ecosystemWorkflows: {},
  analyticsEngine: { confidence: {}, financialEstimates: { netProfit: 999 } },
  projectedMarket: { futureMarketPressure: 70 }, plannedBusinesses: [{ id: "test-plan" }],
  propertyMarketplace: { properties: [] }, aiNarratives: {},
  bestAreaFinder: { status: "READY", rankedAreas: [{ name: "Test area", score: 60 }] },
  sources: { businesses: { source: "test fixture" } }, meta: { generatedAt: "2026-09-01T00:00:00Z" },
  futurePremiumField: { hidden: true }
};
let analysisCalls = 0;
require("../services/analysis").analyzeBusiness = async () => { analysisCalls += 1; return structuredClone(fixture); };
require("../services/marketSnapshot").getCompetitorSnapshot = async () => ({ competitors: fixture.competitors, market: fixture.market, sources: {}, generatedAt: "2026-09-01", dataVersion: "fixture" });
const app = require("../index");
let server, base, basic, pro, business, enterprise, admin, analysisId;
const account = (plan = "BASIC", status = "ACTIVE", extra = {}) => ({ role: "USER", subscriptionPlan: plan, subscriptionStatus: status, ...extra });

async function request(path, { session, method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { ...(session ? { Authorization: `Bearer ${session.token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  return { status: response.status, data, headers: response.headers };
}

async function register(plan, role = "USER") {
  const response = await request("/api/auth/register", { method: "POST", body: { email: `${crypto.randomUUID()}@example.test`, password: "integration-test-password", name: "Test user", role: "ADMIN", subscriptionPlan: "ENTERPRISE", subscriptionStatus: "ACTIVE" } });
  assert.equal(response.status, 201);
  assert.equal(response.data.user.role, "USER");
  assert.equal(response.data.user.subscriptionPlan, "BASIC");
  await database.updateUserAccess({ userId: response.data.user.id, updates: { role, subscriptionPlan: plan }, allowRole: true });
  return response.data;
}

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  basic = await register("BASIC"); pro = await register("PRO"); business = await register("BUSINESS");
  enterprise = await register("ENTERPRISE"); admin = await register("BASIC", "ADMIN");
  analysisId = await database.saveAnalysis({ userId: basic.user.id, input: fixture.input, result: fixture });
});
after(async () => { server?.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });

test("plan matrix, all features, expiration and fail-closed values", () => {
  for (const feature of Object.keys(policy.FEATURE_PLANS)) {
    assert.equal(policy.canAccessFeature({ role: "ADMIN" }, feature), true);
    assert.equal(policy.canAccessFeature(account(), feature), ["BASIC_ANALYSIS", "SMART_MAP"].includes(feature));
  }
  for (const status of ["INACTIVE", "CANCELLED", "PAST_DUE", "invalid"]) assert.equal(policy.canAccessFeature(account("ENTERPRISE", status), "AI_ADVISOR"), false);
  assert.equal(policy.canAccessFeature(account("PRO", "ACTIVE", { subscriptionExpiresAt: "2020-01-01" }), "AI_ADVISOR"), false);
  assert.equal(policy.canAccessFeature(account("PRO", "ACTIVE", { subscriptionExpiresAt: "invalid" }), "AI_ADVISOR"), false);
  assert.equal(policy.canAccessFeature(account("PRO", "ACTIVE", { subscriptionExpiresAt: "2099-01-01" }), "AI_ADVISOR"), true);
  assert.equal(policy.canAccessFeature(account("ENTERPRISE"), "UNKNOWN_FEATURE"), false);
  assert.equal(policy.canAccessFeature({ role: "ADMIN" }, "FUTURE_FEATURE"), true);
  assert.equal(policy.canAccessFeature(account("BUSINESS"), "DIGITAL_TWIN"), true);
  assert.equal(policy.canAccessFeature(account("PRO"), "BUSINESS_HEALTH"), false);
});

test("demo mode grants the Enterprise subscription to every registered demo user", async () => {
  const previousMode = process.env.MERCORA_DEMO_MODE;
  process.env.MERCORA_DEMO_MODE = "true";
  try {
    const { registerUser } = require("../services/auth");
    const session = await registerUser({ email: `${crypto.randomUUID()}@example.test`, password: "integration-test-password", name: "Demo user" });
    assert.equal(session.user.subscriptionPlan, "ENTERPRISE");
    assert.equal(session.user.subscriptionStatus, "ACTIVE");
    const response = await request("/api/access", { session });
    assert.equal(response.status, 200);
    assert.equal(response.data.demoSubscription, true);
    assert.equal(response.data.access.plan, "ENTERPRISE");
    assert.equal(response.data.access.features.includes("ENTERPRISE_TOOLS"), true);
  } finally {
    if (previousMode === undefined) delete process.env.MERCORA_DEMO_MODE;
    else process.env.MERCORA_DEMO_MODE = previousMode;
  }
});

test("BASIC projection has no nested scores, ratings, prices, forecasts or future fields", () => {
  const original = JSON.stringify(fixture);
  const result = projectAnalysis(fixture, account());
  for (const key of ["opportunityScore", "probability", "proprietaryScoring", "plannedBusinesses", "projectedMarket", "propertyMarketplace", "bestAreaFinder", "analytics", "aiNarratives", "charts", "futurePremiumField"]) assert.equal(key in result, false, key);
  assert.equal(result.competitors[0].rating, undefined);
  assert.equal(result.competitors[0].priceSamples, undefined);
  assert.equal(result.market.density, undefined);
  assert.equal(result.market.competitorCount, 1);
  assert.equal(JSON.stringify(fixture), original, "must not mutate the engine result");
});

test("PRO, BUSINESS, ENTERPRISE and ADMIN receive their permitted result groups", () => {
  const p = projectAnalysis(fixture, account("PRO"));
  assert.equal(p.opportunityScore.score, 60);
  assert.equal(p.projectedMarket, undefined);
  assert.equal(p.analyticsEngine.financialEstimates, undefined);
  assert.equal(p.charts.profitabilityProjection, undefined);
  assert.equal(p.budgetPlan.breakEvenTransactions, undefined);
  assert.equal(p.cityEconomicIndicator, undefined);
  assert.equal(p.bestAreaFinder.rankedAreas[0].name, "Test area");
  const b = projectAnalysis(fixture, account("BUSINESS"));
  assert.equal(b.projectedMarket.futureMarketPressure, 70);
  assert.equal(b.charts.profitabilityProjection[0].revenue, 999);
  assert.equal(b.ecosystemWorkflows, undefined);
  assert.ok(projectAnalysis(fixture, account("ENTERPRISE")).ecosystemWorkflows);
  assert.ok(projectAnalysis(fixture, { role: "ADMIN" }).futurePremiumField);
});

const premiumRoutes = [
  ["POST", "/api/chat"], ["POST", "/chat"], ["POST", "/api/chat/stream"], ["POST", "/chat/stream"],
  ["POST", "/api/area-analysis/best"],
  ["GET", "/api/prices"], ["GET", "/prices"], ["GET", "/api/planned-businesses"],
  ["POST", "/api/planned-businesses"], ["PATCH", "/api/planned-businesses/test"], ["DELETE", "/api/planned-businesses/test"],
  ["GET", "/api/market-pressure"], ["POST", "/api/projected-analytics"], ["POST", "/api/opportunity-alternatives"],
  ["GET", "/api/properties"], ["POST", "/api/properties/recommendations"], ["GET", "/api/analyses"],
  ["GET", "/api/city-indicators"], ["POST", "/api/export/report"], ["POST", "/api/export/report/html"],
  ["GET", "/api/admin/users"], ["POST", "/api/price-observations"], ["POST", "/api/properties/test/moderate"]
];
for (const [method, path] of premiumRoutes) test(`${method} ${path}: anonymous 401 and BASIC 403 before handler execution`, async () => {
  assert.equal((await request(path, { method, body: method === "GET" ? undefined : {} })).status, 401);
  const response = await request(path, { session: basic, method, body: method === "GET" ? undefined : {} });
  assert.equal(response.status, 403);
  assert.equal(response.data.code, "FEATURE_REQUIRES_UPGRADE");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("basic analysis and map work, all analysis aliases return only allowed data", async () => {
  for (const path of ["/api/analyze", "/api/analyze-market", "/analyze", "/analyze-market"]) {
    const response = await request(path, { method: "POST", session: basic, body: { ...fixture.input, role: "ADMIN", subscriptionPlan: "ENTERPRISE" } });
    assert.equal(response.status, 200);
    assert.equal(response.data.opportunityScore, undefined);
    assert.equal(response.data.market.competitorCount, 1);
  }
  const response = await request("/api/competitors?city=Aktau&businessType=coffee_shop", { session: basic });
  assert.equal(response.status, 200);
  assert.equal(response.data.competitors[0].rating, undefined);
  const invalid = await request("/api/analyze", { session: basic, method: "POST", body: {} });
  assert.equal(invalid.status, 400);
  assert.equal(analysisCalls, 4);
});

test("history re-fetch strips premium fields and enforces ownership", async () => {
  const response = await request(`/api/analyses/${analysisId}`, { session: basic });
  assert.equal(response.status, 200);
  assert.equal(response.data.probability, undefined);
  assert.equal((await request(`/api/analyses/${analysisId}`, { session: pro })).status, 404);
  assert.equal((await request(`/api/analyses/${analysisId}`)).status, 401);
});

test("active PRO can use AI, BUSINESS can use future market, ENTERPRISE can use city intelligence", async () => {
  assert.equal((await request("/api/chat", { session: pro, method: "POST", body: { message: "Hello", language: "en" } })).status, 200);
  const areas = await request("/api/area-analysis/best", { session: pro, method: "POST", body: fixture.input });
  assert.equal(areas.status, 200);
  assert.ok(["READY", "BUDGET_NOT_VIABLE"].includes(areas.data.status));
  assert.ok(areas.data.rankedAreas.length > 0);
  assert.ok(areas.data.analysisId);
  for (const session of [business, enterprise, admin]) {
    assert.equal((await request("/api/area-analysis/best", { session, method: "POST", body: fixture.input })).status, 200);
  }
  assert.equal((await request("/api/market-pressure?city=Aktau", { session: pro })).status, 403);
  assert.equal((await request("/api/market-pressure?city=Aktau", { session: business })).status, 200);
  assert.equal((await request("/api/city-indicators?city=Aktau", { session: business })).status, 403);
  assert.equal((await request("/api/city-indicators?city=Aktau", { session: enterprise })).status, 200);
});

test("same token follows server-side cancellation, expiry and reactivation immediately", async () => {
  for (const updates of [{ subscriptionStatus: "CANCELLED" }, { subscriptionStatus: "PAST_DUE" }, { subscriptionStatus: "ACTIVE", subscriptionExpiresAt: "2020-01-01" }]) {
    await database.updateUserAccess({ userId: pro.user.id, updates });
    assert.equal((await request("/api/chat", { session: pro, method: "POST", body: { message: "Hello" } })).status, 403);
    const response = await request("/api/analyze", { session: pro, method: "POST", body: fixture.input });
    assert.equal(response.status, 200); assert.equal(response.data.opportunityScore, undefined);
  }
  await database.updateUserAccess({ userId: pro.user.id, updates: { subscriptionStatus: "ACTIVE", subscriptionExpiresAt: null } });
});

test("client state, forged token claims, mixed case and trailing slash do not bypass restrictions", async () => {
  assert.equal((await request("/API/CHAT/", { session: basic, method: "POST", body: { user: admin.user, role: "ADMIN", plan: "ENTERPRISE" }, headers: { "X-Role": "ADMIN" } })).status, 403);
  const parts = basic.token.split(".");
  parts[1] = Buffer.from(JSON.stringify({ sub: admin.user.id, role: "ADMIN", exp: 9999999999 })).toString("base64url");
  assert.equal((await request("/api/admin/users", { session: { token: parts.join(".") } })).status, 401);
  assert.equal((await request("/api/admin/users", { session: { token: basic.token + ".extra" } })).status, 401);
});

test("admin can manage subscriptions but no HTTP caller can assign roles", async () => {
  const list = await request("/api/admin/users", { session: admin });
  assert.equal(list.status, 200);
  assert.ok(list.data.users.length >= 5);
  assert.ok(list.data.users.every((user) => !user.passwordHash && !user.password_hash));
  const route = `/api/admin/users/${basic.user.id}`;
  assert.equal((await request(route, { session: basic, method: "PATCH", body: { subscriptionPlan: "PRO" } })).status, 403);
  assert.equal((await request(route, { session: admin, method: "PATCH", body: { role: "ADMIN" } })).status, 400);
  assert.equal((await request(route, { session: admin, method: "PATCH", body: { subscriptionStatus: "INVALID" } })).status, 400);
  assert.equal((await request(route, { session: admin, method: "PATCH", body: { subscriptionExpiresAt: 0 } })).status, 400);
  assert.equal((await request(route, { session: admin, method: "PATCH", body: { subscriptionPlan: "PRO" } })).status, 200);
  assert.equal((await request("/api/access", { session: basic })).data.access.plan, "PRO");
  await database.updateUserAccess({ userId: basic.user.id, updates: { subscriptionPlan: "BASIC" } });
  await assert.rejects(database.updateUserAccess({ userId: admin.user.id, updates: { role: "USER" }, allowRole: true }), /last administrator/);
});

test("subscription request records intent without activating a paid plan", async () => {
  const response = await request("/api/subscription-requests", { session: basic, method: "POST", body: { plan: "PRO" } });
  assert.equal(response.status, 202);
  assert.equal(response.data.status, "REQUESTED");
  assert.equal((await request("/api/me", { session: basic })).data.user.subscriptionPlan, "BASIC");
  assert.equal((await request("/api/subscription-requests", { session: basic, method: "POST", body: { plan: "ADMIN" } })).status, 400);
});

test("Gemini context receives only allowed analysis and memory is isolated on tier changes", async () => {
  const proContext = buildAnalyticsContext(projectAnalysis(fixture, account("PRO")));
  assert.equal(proContext.projectedMarket, null);
  assert.deepEqual(proContext.profitabilityProjections, []);
  const businessContext = buildAnalyticsContext(projectAnalysis(fixture, account("BUSINESS")));
  assert.equal(businessContext.projectedMarket.futureMarketPressure, 70);
  const b = { ...business.user, ...account("BUSINESS") };
  await saveConversationMessage({ user: b, role: "assistant", content: "Private forecast from previous tier" });
  assert.equal((await loadConversationMemory({ user: b })).length, 1);
  assert.equal((await loadConversationMemory({ user: { ...b, subscriptionPlan: "PRO" } })).length, 0);
});
