function buildRealtimeAnalytics({ competitors, prices, stats, budgetPlan, opportunityScore }) {
  return {
    refreshedAt: new Date().toISOString(),
    competitorCount: competitors.length,
    pricedBusinesses: countPricedBusinesses(prices),
    priceSampleCount: prices.length,
    averagePrice: stats.avgPrice,
    breakEvenTransactions: budgetPlan.breakEvenTransactions,
    runwayMonths: budgetPlan.runwayMonths,
    opportunityScore: opportunityScore.score,
    marketSignal: getMarketSignal(opportunityScore.score),
    rating: {
      average: calculateAverageRating(competitors),
      ratedCompetitors: competitors.filter((competitor) => Number.isFinite(Number(competitor.rating))).length
    }
  };
}

function buildPremiumAnalyticsEngine({ result }) {
  const districtRows = result.districtMetrics?.length ? result.districtMetrics : result.opportunityAreas || [];
  const riskRows = result.strategicIntelligence?.riskAnalysis || [];
  const marketGaps = result.strategicIntelligence?.marketGapDetection || [];
  const scenarios = result.investorDecision?.scenarios || [];
  const projection = result.charts?.profitabilityProjection || [];
  const dataConfidence = result.investorDecision?.dataRoom?.score ?? result.probability?.assumptions?.evidenceScore ?? 0;

  return {
    engine: "TezTap Premium Analytics Engine",
    version: "2.0",
    generatedAt: new Date().toISOString(),
    confidence: buildEngineConfidence({ result, dataConfidence }),
    competitionDensity: buildCompetitionDensityModel({ result, districtRows }),
    saturation: buildSaturationModel({ result, districtRows }),
    districtRankings: buildDistrictRankingModel({ districtRows }),
    opportunityScores: buildOpportunityScoreModel({ result }),
    pricingIntelligence: buildPricingModel({ result }),
    riskAnalysis: buildRiskModel({ result, riskRows }),
    growthPotential: buildGrowthPotentialModel({ result, districtRows }),
    marketGaps: buildMarketGapModel({ result, marketGaps }),
    financialEstimates: buildFinancialEstimateModel({ result, scenarios, projection }),
    formulas: buildEngineFormulas()
  };
}

function buildEngineConfidence({ result, dataConfidence }) {
  const competitorCoverage = clampScore((result.market?.competitorCount || 0) * 6);
  const priceCoverage = clampScore((result.stats?.sampleCount || 0) * 8);
  const districtCoverage = clampScore((result.districtMetrics?.length || result.opportunityAreas?.length || 0) * 18);
  const budgetQuality = clampScore(result.budgetPlan?.budgetRealismScore || 0);
  const score = clampScore(
    competitorCoverage * 0.24 +
      priceCoverage * 0.24 +
      districtCoverage * 0.18 +
      budgetQuality * 0.18 +
      (Number(dataConfidence) || 0) * 0.16
  );

  return {
    score,
    label: score >= 78 ? "Investor-grade" : score >= 58 ? "Pilot-grade" : "Validation required",
    drivers: {
      competitorCoverage,
      priceCoverage,
      districtCoverage,
      budgetQuality,
      dataConfidence
    },
    explanation: `Confidence is ${score}/100 from competitor coverage, price evidence, district coverage, budget realism, and probability evidence quality.`
  };
}

function buildCompetitionDensityModel({ result, districtRows }) {
  const districts = districtRows.map((district) => {
    const direct = Number(district.directCompetitors ?? district.densityCount ?? 0) || 0;
    const nearby = Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0) || 0;
    const densityIndex = clampScore(direct * 18 + nearby * 12);
    const averageRating = calculateDistrictAverageRating(result.competitors || [], district.district || district.name);

    return {
      district: district.district || district.name,
      directCompetitors: direct,
      nearbyCompetitors: nearby,
      densityIndex,
      densityLevel: densityIndex >= 70 ? "high" : densityIndex >= 38 ? "medium" : "low",
      averageRating,
      explanation: `${direct} direct and ${nearby} nearby competitors create ${densityIndex}/100 density pressure.`
    };
  });

  return {
    overall: result.market?.density || "Unknown",
    competitorCount: result.market?.competitorCount || 0,
    districts,
    lowestDensityDistrict: districts.slice().sort((left, right) => left.densityIndex - right.densityIndex)[0] || null,
    highestDensityDistrict: districts.slice().sort((left, right) => right.densityIndex - left.densityIndex)[0] || null
  };
}

function buildSaturationModel({ result, districtRows }) {
  const districts = districtRows.map((district) => {
    const saturationScore = getSaturationScore(district.saturation, district.nearbyCompetitors ?? district.competitorCountNearby);

    return {
      district: district.district || district.name,
      label: district.saturation || "unknown",
      saturationScore,
      nearbyCompetitors: district.nearbyCompetitors ?? district.competitorCountNearby ?? 0,
      underservedScore: district.underservedScore ?? 0,
      pressure: saturationScore >= 70 ? "avoid unless differentiated" : saturationScore >= 42 ? "test carefully" : "attractive whitespace",
      explanation: `${district.district || district.name} is ${district.saturation || "unknown"} saturation with ${district.nearbyCompetitors ?? district.competitorCountNearby ?? 0} nearby competitors and ${district.underservedScore ?? 0}/100 underserved demand.`
    };
  });

  return {
    overall: result.opportunityScore?.saturation || result.saturationData?.overall || "Unknown",
    districts,
    highRiskDistricts: districts.filter((district) => district.saturationScore >= 70),
    attractiveDistricts: districts.filter((district) => district.saturationScore < 42)
  };
}

function buildDistrictRankingModel({ districtRows }) {
  return districtRows.map((district, index) => {
    const opportunityScore = Number(district.opportunityScore ?? district.score ?? 0) || 0;
    const nearby = Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0) || 0;
    const underserved = Number(district.underservedScore) || 0;
    const footTraffic = Number(district.footTraffic) || 0;
    const rentIndex = Number(district.rentIndex) || 0;
    const saturationScore = getSaturationScore(district.saturation, nearby);

    return {
      rank: district.rank || index + 1,
      district: district.district || district.name,
      opportunityScore,
      recommendation: opportunityScore >= 72 ? "priority launch zone" : opportunityScore >= 58 ? "pilot candidate" : "validation only",
      drivers: {
        underservedDemand: underserved,
        footTraffic,
        competitionRelief: clampScore(100 - nearby * 18),
        rentFit: clampScore(100 - rentIndex),
        saturationRelief: clampScore(100 - saturationScore)
      },
      explanation: `${district.district || district.name} ranks #${district.rank || index + 1} because it combines ${underserved}/100 underserved demand, ${footTraffic}/100 traffic, ${nearby} nearby competitors, and ${district.saturation || "unknown"} saturation.`
    };
  });
}

function buildOpportunityScoreModel({ result }) {
  return {
    score: result.opportunityScore?.score || 0,
    label: result.opportunityScore?.label || "Unknown",
    bestDistrict: result.opportunityScore?.bestDistrict || result.recommendation?.bestArea || null,
    factors: result.opportunityScore?.factors || {},
    assumptions: result.opportunityScore?.assumptions || {},
    explanation: `Opportunity score is ${result.opportunityScore?.score || 0}/100, driven by budget realism, competition, pricing, underserved demand, saturation, and profitability factors.`
  };
}

function buildPricingModel({ result }) {
  const priceSpread = Math.max(0, (result.stats?.maxPrice || 0) - (result.stats?.minPrice || 0));
  const spreadRatio = result.stats?.avgPrice ? round(priceSpread / result.stats.avgPrice, 2) : 0;

  return {
    evidence: result.pricingIntelligence?.evidence || "unknown",
    sampleCount: result.stats?.sampleCount || 0,
    corridor: {
      min: result.stats?.minPrice || 0,
      average: result.stats?.avgPrice || 0,
      max: result.stats?.maxPrice || 0,
      spread: priceSpread,
      spreadRatio
    },
    suggestedPrice: result.recommendation?.suggestedPrice || 0,
    pricePosition: result.recommendation?.pricePosition || "not calculated",
    categoryStats: result.pricingIntelligence?.categoryStats || [],
    risk: result.stats?.sampleCount < 4 ? "thin evidence" : spreadRatio > 1.2 ? "wide dispersion" : "usable corridor",
    explanation: result.recommendation?.pricingStrategy || "Pricing strategy requires more verified product-level samples."
  };
}

function buildRiskModel({ result, riskRows }) {
  const budgetRisk = result.budgetPlan?.isBelowMinimum ? 90 : result.budgetPlan?.runwayMonths < 6 ? 68 : 34;
  const saturationRisk = getSaturationScore(result.opportunityScore?.saturation, result.market?.competitorCount);
  const pricingRisk = result.stats?.sampleCount < 4 ? 74 : 36;
  const score = clampScore(budgetRisk * 0.38 + saturationRisk * 0.34 + pricingRisk * 0.28);

  return {
    riskScore: score,
    level: score >= 70 ? "High" : score >= 45 ? "Medium" : "Controlled",
    risks: riskRows,
    drivers: {
      budgetRisk,
      saturationRisk,
      pricingRisk
    },
    explanation: `Risk score is ${score}/100 from capital realism, saturation pressure, and price evidence depth.`
  };
}

function buildGrowthPotentialModel({ result, districtRows }) {
  const districts = districtRows.map((district) => {
    const demand = Number(district.underservedScore) || 0;
    const traffic = Number(district.footTraffic) || 0;
    const saturationRelief = clampScore(100 - getSaturationScore(district.saturation, district.nearbyCompetitors ?? district.competitorCountNearby));
    const growthScore = clampScore(demand * 0.42 + traffic * 0.32 + saturationRelief * 0.26);

    return {
      district: district.district || district.name,
      growthScore,
      underservedDemand: demand,
      footTraffic: traffic,
      saturationRelief,
      explanation: `${district.district || district.name} growth potential is ${growthScore}/100 from underserved demand, traffic, and saturation relief.`
    };
  }).sort((left, right) => right.growthScore - left.growthScore);

  return {
    topDistrict: districts[0] || null,
    districts,
    insights: result.growthInsights || []
  };
}

function buildMarketGapModel({ result, marketGaps }) {
  const gaps = (marketGaps.length ? marketGaps : result.opportunityScore?.underservedDistricts || []).map((gap) => {
    const district = gap.district || gap.area;
    const underserved = Number(gap.underservedScore) || 0;
    const direct = Number(gap.directCompetitors) || 0;
    const nearby = Number(gap.nearbyCompetitors) || 0;
    const priorityScore = clampScore(underserved * 0.62 + Math.max(0, 100 - direct * 22 - nearby * 10) * 0.38);

    return {
      district,
      priorityScore,
      underservedScore: underserved,
      directCompetitors: direct,
      nearbyCompetitors: nearby,
      signal: gap.signal || (priorityScore >= 72 ? "Strong gap" : priorityScore >= 54 ? "Emerging gap" : "Weak gap"),
      explanation: `${district} has ${underserved}/100 underserved demand, ${direct} direct competitors, and ${nearby} nearby competitors.`
    };
  }).sort((left, right) => right.priorityScore - left.priorityScore);

  return {
    gaps,
    strongestGap: gaps[0] || null
  };
}

function buildFinancialEstimateModel({ result, scenarios, projection }) {
  const assumptions = result.probability?.assumptions || {};
  const firstPositiveMonth = projection.find((row) => Number(row.netProfit) > 0)?.month || null;

  return {
    budget: {
      inputBudget: result.budgetPlan?.inputBudget,
      minimumViableBudget: result.budgetPlan?.minimumViableBudget,
      budgetShortfall: result.budgetPlan?.budgetShortfall || 0,
      budgetRealismScore: result.budgetPlan?.budgetRealismScore,
      budgetRiskLevel: result.budgetPlan?.budgetRiskLevel,
      runwayMonths: result.budgetPlan?.runwayMonths
    },
    unitEconomics: {
      averagePrice: result.stats?.avgPrice || assumptions.priceBasis || 0,
      grossProfitPerTransaction: result.budgetPlan?.grossProfitPerTransaction,
      breakEvenTransactions: result.budgetPlan?.breakEvenTransactions,
      plannedTransactions: result.budgetPlan?.plannedTransactions
    },
    forecast: {
      projectedMonthlyRevenue: assumptions.projectedMonthlyRevenue || scenarios[0]?.revenue || 0,
      projectedNetProfit: assumptions.projectedNetProfit || scenarios[0]?.netProfit || 0,
      paybackMonths: assumptions.paybackMonths || null,
      firstPositiveMonth,
      scenarios,
      projection
    },
    explanation: `Financial estimates use budget realism, monthly operating cost, planned transactions, average price, gross margin, and break-even volume.`
  };
}

function buildEngineFormulas() {
  return {
    confidence: "competitorCoverage*0.24 + priceCoverage*0.24 + districtCoverage*0.18 + budgetQuality*0.18 + probabilityEvidence*0.16",
    districtRanking: "underservedDemand + footTraffic + competitionRelief + rentFit + saturationRelief",
    growthPotential: "underservedDemand*0.42 + footTraffic*0.32 + saturationRelief*0.26",
    marketGapPriority: "underservedDemand*0.62 + lowCompetitionRelief*0.38",
    riskScore: "budgetRisk*0.38 + saturationRisk*0.34 + pricingRisk*0.28"
  };
}

function countPricedBusinesses(prices) {
  return new Set(prices.map((price) => price.businessName)).size;
}

function calculateAverageRating(competitors) {
  const rated = competitors.filter((competitor) => Number.isFinite(Number(competitor.rating)) && Number(competitor.rating) > 0);

  if (!rated.length) {
    return 0;
  }

  const weightedTotal = rated.reduce((sum, competitor) => {
    const weight = Math.max(1, Math.min(200, Number(competitor.ratingsCount) || 1));
    return sum + Number(competitor.rating) * weight;
  }, 0);
  const totalWeight = rated.reduce((sum, competitor) => sum + Math.max(1, Math.min(200, Number(competitor.ratingsCount) || 1)), 0);

  return Math.round((weightedTotal / totalWeight) * 10) / 10;
}

function getMarketSignal(score) {
  if (score >= 75) {
    return "expand";
  }

  if (score >= 55) {
    return "test carefully";
  }

  return "avoid unless differentiated";
}

function calculateDistrictAverageRating(competitors, district) {
  const rows = competitors.filter((competitor) => competitor.area === district);
  return calculateAverageRating(rows);
}

function getSaturationScore(label, nearbyCompetitors = 0) {
  const normalized = String(label || "").toLowerCase();

  if (normalized.includes("high")) {
    return 84;
  }

  if (normalized.includes("moderate") || normalized.includes("medium")) {
    return 56;
  }

  if (normalized.includes("low")) {
    return 24;
  }

  return Math.min(100, Math.max(0, Number(nearbyCompetitors) * 22 || 0));
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

module.exports = {
  buildRealtimeAnalytics,
  buildPremiumAnalyticsEngine,
  calculateAverageRating
};
