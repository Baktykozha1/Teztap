// The backend and Next.js use this same policy. Entitlements come from the database.
/** @type {Readonly<Record<string, string>>} */
const FEATURE_PLANS = Object.freeze({
  BASIC_ANALYSIS: "BASIC", SMART_MAP: "BASIC",
  OPPORTUNITY_SCORE: "PRO", ADVANCED_COMPETITION: "PRO", DEMOGRAPHICS: "PRO",
  MARKET_GAP: "PRO", AI_ADVISOR: "PRO", LOCATION_COMPARISON: "PRO",
  OPPORTUNITY_SCANNER: "PRO", PRICING: "PRO", BEST_DISTRICT_FINDER: "PRO",
  DYNAMIC_MARKET: "BUSINESS", PLANNED_BUSINESS: "BUSINESS",
  FUTURE_MARKET_PRESSURE: "BUSINESS", DIGITAL_TWIN: "BUSINESS",
  BUSINESS_HEALTH: "BUSINESS", REPORTS: "BUSINESS", EXPORT: "BUSINESS",
  FORECASTING: "BUSINESS", MULTIPLE_PROJECTS: "BUSINESS", TEAM_TOOLS: "BUSINESS",
  COMMERCIAL_PROPERTIES: "BUSINESS", PREMIUM_ALERTS: "BUSINESS",
  API_ACCESS: "ENTERPRISE", CUSTOM_INTEGRATIONS: "ENTERPRISE",
  EXPANSION: "ENTERPRISE", ENTERPRISE_TOOLS: "ENTERPRISE", ADMIN_TOOLS: "ADMIN"
});
const PLANS = Object.freeze(["BASIC", "PRO", "BUSINESS", "ENTERPRISE"]);
const ROLES = Object.freeze(["USER", "ADMIN"]);
const STATUSES = Object.freeze(["ACTIVE", "INACTIVE", "CANCELLED", "PAST_DUE"]);
const PLAN_FEATURES = Object.freeze(Object.fromEntries(PLANS.map((plan, index) => [
  plan, Object.freeze(Object.keys(FEATURE_PLANS).filter((feature) => {
    const required = PLANS.indexOf(FEATURE_PLANS[feature]);
    return required >= 0 && required <= index;
  }))
])));
const PAGE_FEATURES = Object.freeze({
  "/analyze": "BASIC_ANALYSIS", "/map": "SMART_MAP",
  "/opportunities": "OPPORTUNITY_SCANNER", "/areas": "BEST_DISTRICT_FINDER", "/assistant": "AI_ADVISOR",
  "/history": "MULTIPLE_PROJECTS", "/reports": "REPORTS",
  "/investors": "ENTERPRISE_TOOLS", "/banks": "ENTERPRISE_TOOLS",
  "/government": "ENTERPRISE_TOOLS", "/economic": "ENTERPRISE_TOOLS",
  "/franchise": "EXPANSION", "/admin": "ADMIN_TOOLS"
});

/** @typedef {{ role?: string, subscriptionPlan?: string, subscriptionStatus?: string, subscriptionExpiresAt?: string | null }} AccessUser */

/** @param {AccessUser | null | undefined} user */
function effectivePlan(user, now = Date.now()) {
  if (!user || user.subscriptionStatus !== "ACTIVE" || typeof user.subscriptionPlan !== "string" || !PLANS.includes(user.subscriptionPlan)) return "BASIC";
  if (user.subscriptionExpiresAt != null) {
    const expiry = Date.parse(user.subscriptionExpiresAt);
    if (!Number.isFinite(expiry) || expiry <= now) return "BASIC";
  }
  return user.subscriptionPlan;
}

/** @param {AccessUser | null | undefined} user @param {string} feature */
function canAccessFeature(user, feature, now = Date.now()) {
  if (user?.role === "ADMIN") return true;
  return PLAN_FEATURES[effectivePlan(user, now)].includes(feature);
}

/** @param {AccessUser | null | undefined} user */
function getAccess(user) {
  return {
    role: user?.role === "ADMIN" ? "ADMIN" : "USER",
    plan: effectivePlan(user),
    features: user?.role === "ADMIN" ? Object.keys(FEATURE_PLANS) : PLAN_FEATURES[effectivePlan(user)]
  };
}

module.exports = { FEATURE_PLANS, PLANS, ROLES, STATUSES, PLAN_FEATURES, PAGE_FEATURES, effectivePlan, canAccessFeature, getAccess };
