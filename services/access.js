const { FEATURE_PLANS, canAccessFeature, getAccess } = require("../shared/access");
const { buildMapModel } = require("./map");

function requireFeature(feature, { anonymous = false } = {}) {
  return (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    const demoEnterpriseAccess = process.env.MERCORA_DEMO_MODE === "true" && FEATURE_PLANS[feature] !== "ADMIN";
    if (demoEnterpriseAccess) return next();
    if (!req.user && !anonymous) return res.status(401).json({ error: "Authentication required", code: "AUTHENTICATION_REQUIRED" });
    if (!canAccessFeature(req.user, feature)) {
      return res.status(403).json({
        error: "This feature requires an upgrade", code: "FEATURE_REQUIRES_UPGRADE",
        feature, requiredPlan: FEATURE_PLANS[feature] || "ADMIN"
      });
    }
    return next();
  };
}

function pick(value, keys) {
  return Object.fromEntries(keys.filter((key) => value?.[key] !== undefined).map((key) => [key, value[key]]));
}

function basicCompetitors(competitors = []) {
  return competitors.map((item) => ({
    ...pick(item, ["id", "name", "address", "area", "category", "city", "businessType", "sourceName", "sourceUrl", "sourceUpdatedAt"]),
    ...(item.coordinates ? { coordinates: pick(item.coordinates, ["lat", "lng"]) } : {})
  }));
}

// Explicit response allowlists: adding a field to the engine never makes it public automatically.
function projectAnalysis(result, user) {
  if (!result) return null;
  if (user?.role === "ADMIN") return { ...result, access: getAccess(user) };
  const competitors = basicCompetitors(result.competitors);
  const output = {
    ...pick(result, ["input", "meta", "analysisId"]),
    profile: pick(result.profile, ["title"]),
    competitors,
    market: {
      competitorCount: competitors.length,
      areaCounts: result.market?.areaCounts || {},
      map: buildMapModel({ competitors, opportunityAreas: [], fallbackCenter: result.market?.map?.center })
    },
    sources: pick(result.sources, ["businesses", "city"]),
    access: getAccess(user)
  };
  if (canAccessFeature(user, "OPPORTUNITY_SCORE")) {
    Object.assign(output, pick(result, [
      "profile", "competitors", "market", "sources", "prices", "stats", "opportunityScore",
      "probability", "probabilityScores", "proprietaryScoring", "districtMetrics",
      "opportunityAreas", "pricingIntelligence", "businessCategoryStats", "saturationData",
      "opportunityDiscovery", "marketGapEngine", "growthInsights", "strategicIntelligence",
      "bestAreaFinder"
    ]));
    output.analytics = pick(result.analytics, ["refreshedAt", "competitorCount", "pricedBusinesses", "priceSampleCount", "averagePrice", "opportunityScore", "marketSignal", "rating"]);
    output.analyticsEngine = pick(result.analyticsEngine, ["engine", "version", "generatedAt", "confidence", "competitionDensity", "saturation", "districtRankings", "opportunityScores", "pricingIntelligence", "riskAnalysis", "growthPotential", "marketGaps"]);
    output.charts = pick(result.charts, ["priceDistribution", "categoryPrices", "districtComparison", "marketSaturation", "ratingDistribution"]);
    output.budgetPlan = pick(result.budgetPlan, ["inputBudget", "minimumViableBudget", "budgetRealismScore", "budgetShortfall", "isBelowMinimum", "budgetRiskLevel"]);
    output.recommendation = pick(result.recommendation, ["bestArea", "bestLocation", "suggestedPrice", "pricePosition", "confidence", "explanation", "pricingStrategy", "saturation", "underservedDistricts"]);
    output.aiNarratives = pick(result.aiNarratives, ["assistant", "overview", "map", "score", "probability", "prices", "competitors"]);
  }
  if (canAccessFeature(user, "FORECASTING")) {
    Object.assign(output, pick(result, ["budgetPlan", "investorDecision", "analytics", "analyticsEngine", "charts", "recommendation", "aiNarratives"]));
  }
  if (canAccessFeature(user, "DYNAMIC_MARKET")) Object.assign(output, pick(result, ["plannedBusinesses", "projectedMarket"]));
  if (canAccessFeature(user, "COMMERCIAL_PROPERTIES")) Object.assign(output, pick(result, ["propertyMarketplace"]));
  if (canAccessFeature(user, "ENTERPRISE_TOOLS")) Object.assign(output, pick(result, ["ecosystemWorkflows", "cityEconomicIndicator", "investmentModule"]));
  return output;
}

module.exports = { requireFeature, projectAnalysis, basicCompetitors, pick };
