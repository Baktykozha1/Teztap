function buildAnalyticsContext(analysis) {
  if (!analysis) {
    return {
      state: "no_analysis",
      missing: [
        "district rankings",
        "saturation analysis",
        "opportunity scores",
        "business density",
        "market gaps",
        "pricing intelligence",
        "competitor ratings",
        "financial forecasts"
      ]
    };
  }

  const engine = analysis.analyticsEngine || {};
  const competitors = analysis.competitors || [];
  const districtRows = analysis.districtMetrics || analysis.opportunityAreas || [];
  const saturationAnalysis = engine.saturation || analysis.saturationData || null;
  const pricingIntelligence = engine.pricingIntelligence || analysis.pricingIntelligence || null;
  const reviewSentiment = buildReviewSentiment(competitors);
  const heatmapData = buildHeatmapData({ analysis, engine, districtRows });
  const trafficEstimation = buildTrafficEstimation(districtRows);

  const context = {
    state: "analysis_loaded",
    input: analysis.input,
    districtRankings: engine.districtRankings || districtRows,
    saturationAnalysis,
    opportunityScores: engine.opportunityScores || analysis.opportunityScore || null,
    businessDensity: engine.competitionDensity || {
      overall: analysis.market?.density || null,
      competitorCount: analysis.market?.competitorCount || 0,
      densityByArea: analysis.market?.densityByArea || []
    },
    marketGaps: engine.marketGaps || {
      boi: analysis.marketGapEngine?.boi || null,
      gaps: [
        ...(analysis.marketGapEngine?.headlineSignals || []),
        ...(analysis.marketGapEngine?.opportunityTheses || []),
        ...(analysis.strategicIntelligence?.marketGapDetection || analysis.opportunityScore?.underservedDistricts || [])
      ]
    },
    pricingIntelligence,
    competitorRatings: buildCompetitorRatings(competitors),
    competitorCount: analysis.market?.competitorCount ?? competitors.length,
    reviewSentiment,
    financialForecasts: engine.financialEstimates || {
      budgetPlan: analysis.budgetPlan,
      probabilityAssumptions: analysis.probability?.assumptions || null,
      scenarios: analysis.investorDecision?.scenarios || [],
      profitabilityProjection: analysis.charts?.profitabilityProjection || []
    },
    swotAnalysis: analysis.strategicIntelligence?.swot || null,
    riskAnalysis: engine.riskAnalysis || {
      risks: analysis.strategicIntelligence?.riskAnalysis || []
    },
    heatmapData,
    trafficEstimation,
    profitabilityProjections: analysis.charts?.profitabilityProjection || [],
    proprietaryScoring: analysis.proprietaryScoring || null,
    opportunityDiscovery: analysis.opportunityDiscovery || null,
    ecosystemWorkflows: analysis.ecosystemWorkflows || null,
    cityEconomicIndicator: analysis.cityEconomicIndicator || null,
    investmentModule: analysis.investmentModule || null,
    propertyMarketplace: analysis.propertyMarketplace || null,
    bestAreaFinder: analysis.bestAreaFinder || null,
    projectedMarket: analysis.projectedMarket || null,
    plannedBusinesses: analysis.plannedBusinesses || null,
    marketGapEngine: analysis.marketGapEngine || null,
    sources: analysis.sources || null,
    confidence: engine.confidence || {
      score: analysis.investorDecision?.dataRoom?.score ?? analysis.probability?.assumptions?.evidenceScore ?? 0,
      label: "Derived from analysis confidence"
    }
  };

  return {
    ...context,
    structuredAiContext: buildStructuredAiContext({ analysis, context })
  };
}

function buildCompetitorRatings(competitors) {
  const rated = competitors
    .filter((competitor) => Number.isFinite(Number(competitor.rating)) && Number(competitor.rating) > 0)
    .map((competitor) => ({
      name: competitor.name,
      district: competitor.area,
      rating: Number(competitor.rating),
      ratingsCount: Number(competitor.ratingsCount) || 0,
      category: competitor.category || null
    }));

  const weightedTotal = rated.reduce((sum, competitor) => {
    const weight = Math.max(1, Math.min(250, competitor.ratingsCount || 1));
    return sum + competitor.rating * weight;
  }, 0);
  const totalWeight = rated.reduce((sum, competitor) => sum + Math.max(1, Math.min(250, competitor.ratingsCount || 1)), 0);

  return {
    average: totalWeight ? Math.round((weightedTotal / totalWeight) * 10) / 10 : 0,
    ratedCompetitors: rated.length,
    topRated: rated.slice().sort((left, right) => right.rating - left.rating || right.ratingsCount - left.ratingsCount).slice(0, 8),
    weakRated: rated.slice().sort((left, right) => left.rating - right.rating || right.ratingsCount - left.ratingsCount).slice(0, 8)
  };
}

function buildReviewSentiment(competitors) {
  const rated = competitors.filter((competitor) => Number.isFinite(Number(competitor.rating)) && Number(competitor.rating) > 0);
  const positive = rated.filter((competitor) => Number(competitor.rating) >= 4.5).length;
  const neutral = rated.filter((competitor) => Number(competitor.rating) >= 4 && Number(competitor.rating) < 4.5).length;
  const weak = rated.filter((competitor) => Number(competitor.rating) < 4).length;
  const average = buildCompetitorRatings(competitors).average;

  return {
    averageRating: average,
    positiveRatedCompetitors: positive,
    neutralRatedCompetitors: neutral,
    weakRatedCompetitors: weak,
    signal: average >= 4.5
      ? "strong incumbents"
      : average >= 4
        ? "mixed service quality"
        : rated.length
          ? "service gap opportunity"
          : "rating evidence unavailable",
    explanation: rated.length
      ? `Review sentiment is inferred from ${rated.length} rated competitors with ${average}/5 weighted average rating.`
      : "No rating evidence is available, so sentiment should not be inferred."
  };
}

function buildHeatmapData({ analysis, engine, districtRows }) {
  const saturationDistricts = engine.saturation?.districts || analysis.saturationData?.districts || [];
  const growthDistricts = engine.growthPotential?.districts || [];

  return districtRows.map((district) => {
    const name = district.district || district.name;
    const saturation = saturationDistricts.find((item) => (item.district || item.name) === name);
    const growth = growthDistricts.find((item) => item.district === name);

    return {
      district: name,
      coordinates: district.coordinates || null,
      opportunityScore: district.opportunityScore ?? district.score ?? 0,
      saturationScore: saturation?.saturationScore ?? null,
      densityLevel: district.densityLevel || saturation?.densityLevel || null,
      nearbyCompetitors: district.nearbyCompetitors ?? district.competitorCountNearby ?? 0,
      footTraffic: district.footTraffic ?? null,
      underservedScore: district.underservedScore ?? null,
      growthScore: growth?.growthScore ?? null
    };
  });
}

function buildTrafficEstimation(districtRows) {
  return districtRows.map((district) => ({
    district: district.district || district.name,
    footTraffic: district.footTraffic ?? 0,
    anchors: district.anchors || [],
    signal: (district.footTraffic ?? 0) >= 72 ? "high" : (district.footTraffic ?? 0) >= 50 ? "medium" : "low"
  }));
}

function buildStructuredAiContext({ analysis, context }) {
  const rankedDistricts = context.districtRankings || [];
  const bestArea = analysis.bestAreaFinder?.rankedAreas?.[0] || null;
  const selectedDistrict = bestArea || rankedDistricts[0] || null;
  const districtName = selectedDistrict?.district || selectedDistrict?.name || analysis.recommendation?.bestArea || null;
  const heatmap = (context.heatmapData || []).find((item) => item.district === districtName) || context.heatmapData?.[0] || null;
  const traffic = (context.trafficEstimation || []).find((item) => item.district === districtName) || context.trafficEstimation?.[0] || null;
  const saturationDistrict = findDistrictMetric(context.saturationAnalysis?.districts, districtName);
  const density = normalizeDensity({
    district: selectedDistrict,
    heatmap,
    marketDensity: analysis.market?.density,
    competitorCount: context.competitorCount
  });

  return {
    city: analysis.input?.city || null,
    businessType: analysis.input?.businessType || null,
    budget: analysis.input?.budget || null,
    district: districtName,
    competitionDensity: density,
    saturationLevel: selectedDistrict?.saturation || saturationDistrict?.saturation || context.opportunityScores?.saturation || null,
    avgPrice: context.pricingIntelligence?.averagePrice ?? analysis.stats?.avgPrice ?? null,
    suggestedPrice: analysis.recommendation?.suggestedPrice ?? null,
    opportunityScore: selectedDistrict?.opportunityScore ?? selectedDistrict?.score ?? context.opportunityScores?.score ?? 0,
    successProbability: analysis.probability?.successProbability ?? 0,
    trafficEstimate: traffic?.signal || estimateTrafficSignal(heatmap?.footTraffic ?? selectedDistrict?.footTraffic),
    reviewSentiment: context.reviewSentiment?.signal || "rating evidence unavailable",
    competitorCount: context.competitorCount,
    competitorRatingAverage: context.competitorRatings?.average ?? 0,
    marketGapCount: context.marketGaps?.gaps?.length || 0,
    boiScore: context.marketGapEngine?.boi?.score ?? null,
    boiLabel: context.marketGapEngine?.boi?.label ?? null,
    confidenceScore: context.confidence?.score ?? 0,
    propertyMarketplace: analysis.propertyMarketplace || null,
    bestAreaFinder: analysis.bestAreaFinder ? {
      status: analysis.bestAreaFinder.status,
      comparisonRadiusKm: analysis.bestAreaFinder.methodology?.comparisonRadiusKm ?? null,
      rankedAreas: (analysis.bestAreaFinder.rankedAreas || []).map((area) => ({
        rank: area.rank,
        resultType: area.resultType,
        name: area.name,
        areaType: area.areaType,
        score: area.score,
        confidence: area.confidence,
        factors: area.factors,
        strengths: area.strengths,
        risks: area.risks,
        missingData: area.missingData
      })),
      limitations: analysis.bestAreaFinder.limitations || []
    } : null
  };
}

function findDistrictMetric(rows, districtName) {
  return (rows || []).find((row) => (row.district || row.name) === districtName) || null;
}

function normalizeDensity({ district, heatmap, marketDensity, competitorCount }) {
  const nearby = Number(district?.nearbyCompetitors ?? district?.competitorCountNearby ?? heatmap?.nearbyCompetitors);

  if (Number.isFinite(nearby) && Number.isFinite(Number(competitorCount)) && Number(competitorCount) > 0) {
    return Math.round((nearby / Number(competitorCount)) * 100) / 100;
  }

  const densityMap = {
    low: 0.25,
    medium: 0.5,
    high: 0.75,
    extreme: 0.9
  };

  return densityMap[String(marketDensity || "").toLowerCase()] ?? 0;
}

function estimateTrafficSignal(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "unknown";
  }

  if (number >= 72) {
    return "high";
  }

  if (number >= 50) {
    return "medium";
  }

  return "low";
}

module.exports = {
  buildAnalyticsContext
};
