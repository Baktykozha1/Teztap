function buildInvestmentModule({ result }) {
  const districtComparison = result.proprietaryScoring?.comparisons?.districts || [];
  const categoryFit = result.proprietaryScoring?.comparisons?.businessCategories || [];
  const gaps = result.opportunityDiscovery?.marketGaps || result.strategicIntelligence?.marketGapDetection || [];
  const cityIndicator = result.cityEconomicIndicator || null;

  return {
    layer: "TezTap Investment Intelligence Module",
    version: "1.0",
    generatedAt: new Date().toISOString(),
    city: result.input?.city || null,
    thesis: buildInvestmentThesis({ result, cityIndicator }),
    highPotentialDistricts: buildHighPotentialDistricts({ districtComparison }),
    emergingSectors: buildEmergingSectors({ result, categoryFit, gaps }),
    investmentOpportunities: buildInvestmentOpportunities({ result, districtComparison, categoryFit, gaps }),
    riskAssessment: buildInvestmentRiskAssessment({ result }),
    growthTrends: buildGrowthTrends({ result, cityIndicator }),
    guardrail: "Investment outputs use current platform analytics only. The module does not invent sectors, probabilities, city statistics, or historical trends."
  };
}

function buildInvestmentThesis({ result, cityIndicator }) {
  const scores = result.proprietaryScoring?.scores || {};

  return {
    opportunityScore: scores.opportunityScore ?? result.opportunityScore?.score ?? 0,
    investmentAttractiveness: scores.investmentAttractiveness ?? cityIndicator?.indicators?.investmentAttractiveness?.score ?? 0,
    cityCompositeScore: cityIndicator?.compositeScore ?? 0,
    riskScore: scores.riskScore ?? result.analyticsEngine?.riskAnalysis?.riskScore ?? 0,
    why: [
      result.recommendation?.explanation,
      cityIndicator?.why,
      result.analyticsEngine?.riskAnalysis?.explanation
    ].filter(Boolean).join(" ")
  };
}

function buildHighPotentialDistricts({ districtComparison }) {
  return districtComparison
    .slice(0, 8)
    .map((district) => ({
      district: district.district,
      investmentAttractiveness: district.investmentAttractiveness,
      opportunityScore: district.opportunityScore,
      growthPotential: district.growthPotential,
      riskSignal: district.saturationScore,
      recommendation: district.recommendation,
      why: district.why
    }));
}

function buildEmergingSectors({ result, categoryFit, gaps }) {
  const categoryStats = result.businessCategoryStats || [];
  const priceCategories = result.pricingIntelligence?.categoryStats || [];
  const gapCategories = new Set(gaps.map((gap) => gap.category || result.profile?.title || result.input?.businessType).filter(Boolean));
  const sectorRows = new Map();

  for (const category of categoryStats) {
    sectorRows.set(category.category, {
      sector: category.category,
      competitorCount: category.competitorCount || 0,
      priceSamples: category.priceSamples || 0,
      averageRating: category.averageRating || 0,
      signalScore: calculateSectorSignal({ category, gapCategories }),
      why: `${category.category} has ${category.competitorCount || 0} competitors, ${category.priceSamples || 0} price samples, and average rating ${category.averageRating || 0}.`
    });
  }

  for (const category of priceCategories) {
    const current = sectorRows.get(category.category) || {
      sector: category.category,
      competitorCount: 0,
      priceSamples: 0,
      averageRating: 0,
      signalScore: 0,
      why: ""
    };

    current.priceSamples = Math.max(current.priceSamples, category.sampleCount || 0);
    current.averagePrice = category.averagePrice || 0;
    current.signalScore = Math.max(current.signalScore, clampScore((category.sampleCount || 0) * 12));
    current.why = `${current.why} Pricing evidence includes ${category.sampleCount || 0} samples with ${category.averagePrice || 0} KZT average.`;
    sectorRows.set(category.category, current);
  }

  for (const category of categoryFit.filter((item) => item.viability !== "unrealistic").slice(0, 4)) {
    const current = sectorRows.get(category.title) || {
      sector: category.title,
      competitorCount: 0,
      priceSamples: 0,
      averageRating: 0,
      signalScore: 0,
      why: ""
    };

    current.budgetViability = category.viability;
    current.signalScore = Math.max(current.signalScore, category.budgetRealismScore || 0);
    current.why = `${current.why} Budget viability is ${category.viability} with ${category.budgetRealismScore}/100 budget realism.`;
    sectorRows.set(category.title, current);
  }

  return Array.from(sectorRows.values())
    .sort((left, right) => right.signalScore - left.signalScore)
    .slice(0, 8);
}

function buildInvestmentOpportunities({ result, districtComparison, categoryFit, gaps }) {
  const topDistricts = districtComparison.slice(0, 4);
  const viableCategories = categoryFit.filter((category) => category.viability !== "unrealistic").slice(0, 4);
  const opportunities = [];

  for (const district of topDistricts) {
    const category = viableCategories[0] || null;
    const gap = gaps.find((item) => (item.district || item.area) === district.district) || null;

    opportunities.push({
      district: district.district,
      category: category?.title || result.profile?.title || result.input?.businessType || "Selected category",
      investmentAttractiveness: district.investmentAttractiveness,
      opportunityScore: district.opportunityScore,
      growthPotential: district.growthPotential,
      riskSignal: district.saturationScore,
      why: [
        district.why,
        category?.reason,
        gap?.explanation || gap?.signal
      ].filter(Boolean).join(" ")
    });
  }

  return opportunities;
}

function buildInvestmentRiskAssessment({ result }) {
  const risk = result.analyticsEngine?.riskAnalysis || {};
  const risks = risk.risks?.length ? risk.risks : result.strategicIntelligence?.riskAnalysis || [];

  return {
    riskScore: risk.riskScore ?? result.proprietaryScoring?.scores?.riskScore ?? 0,
    level: risk.level || result.budgetPlan?.budgetRiskLevel || "Unknown",
    factors: risks.slice(0, 6).map((item) => ({
      label: item.label || item.title || "Risk",
      level: item.level || item.severity || "Unknown",
      evidence: item.evidence || item.description || "Risk is derived from current analytics."
    })),
    why: risk.explanation || "Risk assessment combines capital realism, saturation pressure, pricing evidence, and competition density."
  };
}

function buildGrowthTrends({ result, cityIndicator }) {
  const cityTrend = cityIndicator?.trendSeries?.points || [];
  const districtGrowth = result.analyticsEngine?.growthPotential?.districts || [];

  return {
    cityTrendType: cityIndicator?.trendSeries?.type || "projected",
    cityTrendExplanation: cityIndicator?.trendSeries?.explanation || "No city trend projection was returned.",
    cityTrend,
    districtGrowth: districtGrowth.slice(0, 8),
    why: "Growth trends are projected from current opportunity, profitability, district demand, saturation relief, and market gap metrics."
  };
}

function calculateSectorSignal({ category, gapCategories }) {
  const competitorRelief = clampScore(100 - Number(category.competitorCount || 0) * 12);
  const priceEvidence = clampScore(Number(category.priceSamples || 0) * 14);
  const ratingSignal = category.averageRating ? clampScore((5 - Number(category.averageRating)) * 18 + 28) : 35;
  const gapBoost = gapCategories.has(category.category) ? 18 : 0;

  return clampScore(competitorRelief * 0.34 + priceEvidence * 0.28 + ratingSignal * 0.22 + gapBoost);
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

module.exports = {
  buildInvestmentModule
};
