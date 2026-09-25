function classifyConsultantIntent(question) {
  const lower = String(question || "").toLowerCase();

  if (matches(lower, ["simulation", "simulate", "before", "after", "optimization", "optimisation", "improve probability", "probability improved", "compare scenarios"])) {
    return "comparative_simulation";
  }

  if (matches(lower, ["boi", "business opportunity index", "opportunity index"])) {
    return "boi_explanation";
  }

  if (matches(lower, ["challenge", "weak idea", "bad idea", "pivot", "alternative", "alternatives", "compare business plans"])) {
    return "strategic_challenge";
  }

  if (matches(lower, ["what business", "which business", "business should", "should i open", "what should i open", "business idea", "business ideas", "open in", "category to open", "какой бизнес", "что открыть", "какой бизнес открыть", "бизнес ашу"])) {
    return "business_recommendation";
  }

  if (matches(lower, ["challenge", "pressure test", "pressure-test", "weak idea", "bad idea", "pivot", "alternative", "alternatives", "compare business", "compare plans", "lower risk"])) {
    return "strategic_advisor";
  }

  if (matches(lower, ["district", "area", "location", "where", "район", "локация", "место", "где", "аудан", "орын"])) {
    return "district_strategy";
  }

  if (matches(lower, ["oversaturated", "saturated", "saturation", "too crowded", "crowded market", "перенасыщен", "насыщен", "бәсекесі көп"])) {
    return "saturation_analysis";
  }

  if (matches(lower, ["price", "pricing", "charge", "menu price", "price strategy", "цена", "стоимость", "ценообразование", "баға"])) {
    return "pricing_strategy";
  }

  if (matches(lower, ["lowest competition", "least competition", "weak competition", "low competition", "competitor", "competition", "конкурент", "конкуренция", "бәсекелестік"])) {
    return "competition_analysis";
  }

  if (matches(lower, ["demand growing", "growth", "where is demand", "demand", "underserved", "market gap", "white space", "whitespace", "спрос", "рост", "незакрытый спрос", "сұраныс", "нарықтағы бос орын"])) {
    return "demand_growth";
  }

  if (matches(lower, ["budget increase", "budget increases", "increase my budget", "budget rises", "budget goes", "more budget", "20 million", "15 million", "увеличу бюджет", "увеличить бюджет", "бюджет өссе", "бюджетті арттырсам"])) {
    return "budget_scenario";
  }

  if (matches(lower, ["forecast", "financial", "break-even", "breakeven", "runway", "profit", "revenue", "payback", "budget", "прогноз", "финансов", "прибыл", "выручк", "окупаем", "бюджет", "қаржы"])) {
    return "financial_forecast";
  }

  if (matches(lower, ["risk", "risks", "downside", "fragile", "threat", "риск", "риски", "угроз", "тәуекел"])) {
    return "risk_analysis";
  }

  if (matches(lower, ["probability", "success", "survival", "chance", "вероятность", "успех", "ықтималдық"])) {
    return "probability_explanation";
  }

  if (matches(lower, ["swot", "strength", "weakness", "opportunity", "сильные стороны", "слабые стороны", "мүмкіндік"])) {
    return "swot_analysis";
  }

  return "executive_summary";
}

function buildRecommendationEvidence({ analysis, analyticsContext, intent, orchestration }) {
  if (!analysis || analyticsContext?.state === "no_analysis") {
    return {
      state: "no_analysis",
      intent,
      missing: analyticsContext?.missing || ["city", "businessType", "budget", "backend analysis result"],
      rule: "Do not recommend a business, district, price, or probability before analysis is available."
    };
  }

  return {
    state: "analysis_loaded",
    intent,
    input: analysis.input,
    orchestrationManifest: orchestration?.manifest || null,
    activeRequestContext: orchestration?.userContext?.requestContext || null,
    conversationMemory: orchestration?.previousChatMemory || null,
    districtRankings: analyticsContext.districtRankings,
    saturationAnalysis: analyticsContext.saturationAnalysis,
    opportunityScores: analyticsContext.opportunityScores,
    businessDensity: analyticsContext.businessDensity,
    marketGaps: analyticsContext.marketGaps,
    pricingIntelligence: analyticsContext.pricingIntelligence,
    competitorRatings: analyticsContext.competitorRatings,
    competitorCount: analyticsContext.competitorCount,
    reviewSentiment: analyticsContext.reviewSentiment,
    financialForecasts: analyticsContext.financialForecasts,
    swotAnalysis: analyticsContext.swotAnalysis,
    riskAnalysis: analyticsContext.riskAnalysis,
    heatmapData: analyticsContext.heatmapData,
    trafficEstimation: analyticsContext.trafficEstimation,
    profitabilityProjections: analyticsContext.profitabilityProjections,
    proprietaryScoring: analyticsContext.proprietaryScoring,
    opportunityDiscovery: analyticsContext.opportunityDiscovery,
    confidence: analyticsContext.confidence,
    aiConfidence: buildAiConfidence({ analysis, analyticsContext }),
    underservedMarketDetection: buildUnderservedMarketDetection({ analysis, analyticsContext }),
    comparativeSimulations: buildComparativeSimulations({ analysis, analyticsContext }),
    sources: analyticsContext.sources
  };
}

function buildResponseIntelligence({ analysis, analyticsContext, consultantBrief }) {
  if (!analysis || analyticsContext?.state !== "analysis_loaded") {
    return {
      insights: [],
      confidenceScore: 0,
      linkedAnalytics: {
        state: "no_analysis",
        missing: analyticsContext?.missing || []
      },
      recommendedDistricts: [],
      riskFactors: [],
      aiConfidence: {
        score: 0,
        label: "Low",
        explanation: "No market analysis is loaded, so data availability, market clarity, and analytics completeness are all insufficient.",
        factors: {
          dataAvailability: 0,
          marketClarity: 0,
          analyticsCompleteness: 0
        }
      },
      underservedMarketDetection: [],
      comparativeSimulations: [],
      opportunityCards: [],
      riskSummaries: [],
      districtComparison: [],
      pricingSummary: null,
      saturationIndicators: [],
      marketGapEngine: null,
      boiScore: null,
      strategicAdvisor: null
    };
  }

  const structured = analyticsContext.structuredAiContext || {};
  const recommendedDistricts = buildRecommendedDistricts(analyticsContext);
  const riskFactors = buildRiskFactors(analyticsContext);
  const aiConfidence = buildAiConfidence({ analysis, analyticsContext });
  const underservedMarketDetection = buildUnderservedMarketDetection({ analysis, analyticsContext });
  const comparativeSimulations = buildComparativeSimulations({ analysis, analyticsContext });
  const opportunityCards = buildOpportunityCards({ analysis, analyticsContext });
  const riskSummaries = buildRiskSummaries({ analysis, analyticsContext });
  const districtComparison = buildDistrictComparison({ analyticsContext });
  const pricingSummary = buildPricingSummary({ analysis, analyticsContext });
  const saturationIndicators = buildSaturationIndicators({ analysis, analyticsContext });
  const marketGapEngine = analyticsContext.marketGapEngine || analysis.marketGapEngine || null;

  return {
    insights: buildInsights({ analysis, analyticsContext, consultantBrief, recommendedDistricts, riskFactors, underservedMarketDetection, aiConfidence, comparativeSimulations }),
    confidenceScore: aiConfidence.score,
    aiConfidence,
    underservedMarketDetection,
    comparativeSimulations,
    opportunityCards,
    riskSummaries,
    districtComparison,
    pricingSummary,
    saturationIndicators,
    marketGapEngine,
    boiScore: marketGapEngine?.boi || null,
    strategicAdvisor: marketGapEngine?.strategicAdvisor || null,
    linkedAnalytics: {
      structuredAiContext: structured,
      scoringEngineOutputs: {
        opportunityScores: analyticsContext.opportunityScores,
        probabilityScores: analysis.probability || analysis.probabilityScores || null,
        budgetPlan: analysis.budgetPlan || null
      },
      marketIntelligence: {
        businessDensity: analyticsContext.businessDensity,
        saturationAnalysis: analyticsContext.saturationAnalysis,
        pricingIntelligence: analyticsContext.pricingIntelligence,
        reviewSentiment: analyticsContext.reviewSentiment,
        marketGaps: analyticsContext.marketGaps,
        underservedMarketDetection,
        comparativeSimulations,
        opportunityCards,
        riskSummaries,
        districtComparison,
        pricingSummary,
        saturationIndicators,
        marketGapEngine,
        boiScore: marketGapEngine?.boi || null,
        strategicAdvisor: marketGapEngine?.strategicAdvisor || null
      },
      heatmapData: analyticsContext.heatmapData,
      trafficEstimation: analyticsContext.trafficEstimation,
      profitabilityProjections: analyticsContext.profitabilityProjections,
      proprietaryScoring: analyticsContext.proprietaryScoring,
      opportunityDiscovery: analyticsContext.opportunityDiscovery,
      marketGapEngine: analyticsContext.marketGapEngine
    },
    recommendedDistricts,
    riskFactors
  };
}

function buildRecommendedDistricts(analyticsContext) {
  return (analyticsContext.districtRankings || [])
    .slice(0, 5)
    .map((district) => ({
      district: district.district || district.name,
      opportunityScore: district.opportunityScore ?? district.score ?? 0,
      saturationLevel: district.saturation || null,
      nearbyCompetitors: district.nearbyCompetitors ?? district.competitorCountNearby ?? 0,
      footTraffic: district.footTraffic ?? null,
      underservedScore: district.underservedScore ?? null,
      why: buildDistrictWhy(district)
    }));
}

function buildRiskFactors(analyticsContext) {
  const risks = analyticsContext.riskAnalysis?.risks || analyticsContext.riskAnalysis || [];

  return (Array.isArray(risks) ? risks : [])
    .slice(0, 6)
    .map((risk) => ({
      label: risk.label || risk.title || "Risk factor",
      level: risk.level || risk.severity || "unknown",
      evidence: risk.evidence || risk.description || risk.reason || "Risk is linked to the current analytics result."
    }));
}

function buildOpportunityCards({ analysis, analyticsContext }) {
  const structured = analyticsContext.structuredAiContext || {};
  const topDistrict = buildRecommendedDistricts(analyticsContext)[0] || null;
  const gap = (analyticsContext.marketGaps?.gaps || [])[0] || null;
  const cards = [];

  if (analysis?.marketGapEngine?.boi) {
    cards.push({
      label: "BOI Score",
      value: `${analysis.marketGapEngine.boi.score}/100`,
      signal: analysis.marketGapEngine.boi.label,
      evidence: analysis.marketGapEngine.boi.explanation
    });
  }

  if (analysis?.opportunityScore) {
    cards.push({
      label: "Market opportunity",
      value: `${analysis.opportunityScore.score}/100`,
      signal: analysis.opportunityScore.label || "Calculated opportunity",
      evidence: `Success probability ${analysis.probability?.successProbability ?? "n/a"}%, saturation ${analysis.opportunityScore.saturation || "n/a"}, competitor count ${analyticsContext.competitorCount ?? "n/a"}.`
    });
  }

  if (topDistrict) {
    cards.push({
      label: "District thesis",
      value: topDistrict.district,
      signal: `${topDistrict.opportunityScore}/100 opportunity`,
      evidence: `${topDistrict.nearbyCompetitors} nearby competitors, footTraffic ${topDistrict.footTraffic ?? "n/a"}, underservedScore ${topDistrict.underservedScore ?? "n/a"}.`
    });
  }

  if (gap) {
    cards.push({
      label: "Market gap",
      value: gap.district || gap.area || "Detected gap",
      signal: `${gap.underservedScore ?? "n/a"}/100 underserved`,
      evidence: `${gap.directCompetitors ?? "n/a"} direct competitors, ${gap.nearbyCompetitors ?? "n/a"} nearby competitors.`
    });
  }

  if (structured.suggestedPrice || structured.avgPrice) {
    cards.push({
      label: "Pricing corridor",
      value: structured.suggestedPrice ? `${structured.suggestedPrice} KZT` : `${structured.avgPrice} KZT avg`,
      signal: analysis.recommendation?.pricePosition || analyticsContext.pricingIntelligence?.evidence || "Pricing evidence",
      evidence: `${analysis.stats?.sampleCount ?? 0} price samples, observed average ${structured.avgPrice ?? "n/a"} KZT.`
    });
  }

  return cards.slice(0, 4);
}

function buildRiskSummaries({ analysis, analyticsContext }) {
  const riskRows = buildRiskFactors(analyticsContext);
  const summaries = riskRows.map((risk) => ({
    label: risk.label,
    level: risk.level,
    evidence: risk.evidence,
    commercialImpact: getCommercialImpact(risk)
  }));

  if (analysis?.budgetPlan && !summaries.some((risk) => /capital|budget/i.test(risk.label))) {
    summaries.push({
      label: "Capital risk",
      level: analysis.budgetPlan.budgetRiskLevel || "unknown",
      evidence: analysis.budgetPlan.isBelowMinimum
        ? `Budget shortfall is ${analysis.budgetPlan.budgetShortfall} KZT versus minimum viable budget ${analysis.budgetPlan.minimumViableBudget} KZT.`
        : `${analysis.budgetPlan.runwayMonths} months runway and budget realism ${analysis.budgetPlan.budgetRealismScore}/100.`,
      commercialImpact: "Capital adequacy constrains runway, launch scope, and how much execution risk the business can absorb."
    });
  }

  return summaries.slice(0, 5);
}

function buildDistrictComparison({ analyticsContext }) {
  return (analyticsContext.districtRankings || [])
    .slice(0, 6)
    .map((district) => ({
      district: district.district || district.name,
      opportunityScore: district.opportunityScore ?? district.score ?? 0,
      saturationLevel: district.saturation || "unknown",
      nearbyCompetitors: district.nearbyCompetitors ?? district.competitorCountNearby ?? 0,
      directCompetitors: district.directCompetitors ?? district.densityCount ?? 0,
      footTraffic: district.footTraffic ?? null,
      underservedScore: district.underservedScore ?? null,
      commercialRead: buildDistrictCommercialRead(district)
    }));
}

function buildPricingSummary({ analysis, analyticsContext }) {
  const pricing = analyticsContext.pricingIntelligence || analysis?.pricingIntelligence || null;

  if (!pricing && !analysis?.stats) {
    return null;
  }

  return {
    evidence: pricing?.evidence || "unknown",
    sampleCount: pricing?.sampleCount ?? analysis.stats?.sampleCount ?? 0,
    averagePrice: pricing?.averagePrice ?? analysis.stats?.avgPrice ?? null,
    minPrice: pricing?.minPrice ?? analysis.stats?.minPrice ?? null,
    maxPrice: pricing?.maxPrice ?? analysis.stats?.maxPrice ?? null,
    suggestedPrice: pricing?.suggestedPrice ?? analysis.recommendation?.suggestedPrice ?? null,
    pricePosition: pricing?.pricePosition ?? analysis.recommendation?.pricePosition ?? null,
    pricingRisk: (pricing?.sampleCount ?? analysis.stats?.sampleCount ?? 0) < 4
      ? "Thin price evidence"
      : (Number(analysis.stats?.maxPrice || 0) - Number(analysis.stats?.minPrice || 0)) > Number(analysis.stats?.avgPrice || 0) * 1.2
        ? "Wide price dispersion"
        : "Usable pricing corridor",
    commercialRead: analysis.recommendation?.pricingStrategy || "Pricing decision should stay tied to verified comparable prices."
  };
}

function buildSaturationIndicators({ analysis, analyticsContext }) {
  const districts = analyticsContext.saturationAnalysis?.districts || analysis?.saturationData?.districts || [];

  return districts.slice(0, 6).map((district) => {
    const nearby = district.nearbyCompetitors ?? district.competitorCountNearby ?? 0;
    const level = district.saturation || district.label || "unknown";

    return {
      district: district.district || district.name,
      level,
      nearbyCompetitors: nearby,
      underservedScore: district.underservedScore ?? null,
      severity: saturationSeverity(level, nearby),
      commercialRead: saturationCommercialRead(level, nearby)
    };
  });
}

function getCommercialImpact(risk) {
  const text = `${risk.label} ${risk.level} ${risk.evidence}`.toLowerCase();

  if (text.includes("capital") || text.includes("budget")) {
    return "May force smaller format, slower hiring, or delayed break-even.";
  }

  if (text.includes("saturation") || text.includes("competitor")) {
    return "Can raise acquisition cost and reduce pricing power unless differentiation is clear.";
  }

  if (text.includes("pricing")) {
    return "Can weaken margin assumptions if the launch price is not validated against comparable offers.";
  }

  return "Should be treated as a validation gate before committing capital.";
}

function buildDistrictCommercialRead(district) {
  const score = Number(district.opportunityScore ?? district.score ?? 0);
  const nearby = Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0);
  const underserved = Number(district.underservedScore ?? 0);

  if (score >= 72 && nearby <= 2 && underserved >= 60) {
    return "Strong candidate: demand gap is visible and competition pressure is manageable.";
  }

  if (nearby >= 4 || String(district.saturation || "").toLowerCase().includes("high")) {
    return "Caution: competition pressure is high, so the offer needs clear differentiation.";
  }

  return "Pilot candidate: economics need field validation before major capital commitment.";
}

function saturationSeverity(level, nearbyCompetitors) {
  const normalized = String(level || "").toLowerCase();

  if (normalized.includes("high") || Number(nearbyCompetitors) >= 4) {
    return "High";
  }

  if (normalized.includes("medium") || normalized.includes("moderate") || Number(nearbyCompetitors) >= 2) {
    return "Medium";
  }

  return "Low";
}

function saturationCommercialRead(level, nearbyCompetitors) {
  const severity = saturationSeverity(level, nearbyCompetitors);

  if (severity === "High") {
    return "High saturation can compress launch velocity and requires differentiation.";
  }

  if (severity === "Medium") {
    return "Moderate saturation supports a careful pilot with tight positioning.";
  }

  return "Low saturation improves room for testing, if demand evidence is strong enough.";
}

function buildInsights({ analysis, analyticsContext, consultantBrief, recommendedDistricts, riskFactors, underservedMarketDetection, aiConfidence, comparativeSimulations }) {
  const structured = analyticsContext.structuredAiContext || {};
  const insights = [];

  if (recommendedDistricts[0]) {
    insights.push({
      type: "district_opportunity",
      message: `${recommendedDistricts[0].district} leads the district ranking because opportunityScore is ${recommendedDistricts[0].opportunityScore} with ${recommendedDistricts[0].nearbyCompetitors} nearby competitors.`
    });
  }

  insights.push({
    type: "market_saturation",
    message: `Saturation is ${structured.saturationLevel || "not available"} and competitionDensity is ${structured.competitionDensity}.`
  });

  if (structured.avgPrice || structured.suggestedPrice) {
    insights.push({
      type: "pricing_intelligence",
      message: `Average observed price is ${structured.avgPrice || "not available"} KZT; suggested launch price is ${structured.suggestedPrice || "not available"} KZT.`
    });
  }

  if (riskFactors[0]) {
    insights.push({
      type: "risk",
      message: `${riskFactors[0].label} is the top visible risk because ${riskFactors[0].evidence}`
    });
  }

  if (underservedMarketDetection?.[0]) {
    insights.push({
      type: "underserved_market",
      message: underservedMarketDetection[0].message
    });
  }

  if (comparativeSimulations?.[0]) {
    const simulation = comparativeSimulations[0];
    insights.push({
      type: "comparative_simulation",
      message: `${simulation.name}: probability moves from ${simulation.before.successProbability}% to ${simulation.after.successProbability}% because ${simulation.probabilityDelta.explanation}`
    });
  }

  if (aiConfidence) {
    insights.push({
      type: "ai_confidence",
      message: `AI confidence is ${aiConfidence.label}: ${aiConfidence.explanation}`
    });
  }

  if (consultantBrief?.intent) {
    insights.push({
      type: "intent",
      message: `Question routed as ${consultantBrief.intent}; answer is grounded in loaded analytics for ${analysis.input?.city || "the selected city"}.`
    });
  }

  return insights;
}

function buildAiConfidence({ analysis, analyticsContext }) {
  const competitorCount = Number(analyticsContext.competitorCount || analysis?.market?.competitorCount || 0);
  const priceSamples = Number(analysis?.stats?.sampleCount || analyticsContext.pricingIntelligence?.sampleCount || 0);
  const districtRows = analyticsContext.districtRankings || [];
  const hasProbability = Boolean(analysis?.probability?.successProbability || analysis?.probabilityScores?.success);
  const hasBudgetPlan = Boolean(analysis?.budgetPlan);
  const hasPricing = Boolean(analyticsContext.pricingIntelligence || analysis?.pricingIntelligence);
  const hasRisks = Boolean(buildRiskFactors(analyticsContext).length);
  const dataAvailability = Math.round((
    scoreCount(competitorCount, [1, 4, 8]) * 0.36 +
    scoreCount(priceSamples, [1, 6, 12]) * 0.34 +
    scoreCount(districtRows.length, [1, 3, 5]) * 0.3
  ));
  const topDistrict = districtRows[0] || {};
  const opportunityScore = Number(topDistrict.opportunityScore ?? topDistrict.score ?? analysis?.opportunityScore?.score ?? 0);
  const scoreClarity = opportunityScore >= 72 || opportunityScore <= 42 ? 90 : opportunityScore >= 60 || opportunityScore <= 52 ? 70 : 48;
  const saturationKnown = Boolean(topDistrict.saturation || analyticsContext.saturationAnalysis?.overall || analysis?.opportunityScore?.saturation);
  const marketClarity = Math.round(scoreClarity * 0.52 + (saturationKnown ? 85 : 35) * 0.24 + (hasRisks ? 82 : 45) * 0.24);
  const completenessItems = [
    Boolean(analyticsContext.opportunityScores),
    hasProbability,
    hasBudgetPlan,
    hasPricing,
    Boolean(districtRows.length),
    Boolean(analyticsContext.businessDensity),
    Boolean(analyticsContext.reviewSentiment),
    Boolean(analysis?.strategicIntelligence)
  ];
  const analyticsCompleteness = Math.round((completenessItems.filter(Boolean).length / completenessItems.length) * 100);
  const score = Math.round(dataAvailability * 0.42 + marketClarity * 0.28 + analyticsCompleteness * 0.3);
  const label = score >= 76 ? "High" : score >= 52 ? "Medium" : "Low";

  return {
    score,
    label,
    explanation: [
      `data availability ${dataAvailability}/100 from ${competitorCount} competitors, ${priceSamples} price samples, and ${districtRows.length} district rows`,
      `market clarity ${marketClarity}/100 from opportunity and saturation signals`,
      `analytics completeness ${analyticsCompleteness}/100 from scoring, probability, pricing, district, budget, and risk modules`
    ].join("; "),
    factors: {
      dataAvailability,
      marketClarity,
      analyticsCompleteness,
      competitorCount,
      priceSamples,
      districtRows: districtRows.length
    }
  };
}

function buildUnderservedMarketDetection({ analysis, analyticsContext }) {
  const detections = [];
  const districtRows = analyticsContext.districtRankings || [];
  const gaps = analyticsContext.marketGaps?.gaps || analysis?.strategicIntelligence?.marketGapDetection || [];
  const categoryStats = analysis?.businessCategoryStats || analysis?.strategicIntelligence?.categoryIntelligence?.categories || [];
  const pricing = analyticsContext.pricingIntelligence || analysis?.pricingIntelligence || {};
  const profileTitle = analysis?.profile?.title || formatBusinessType(analysis?.input?.businessType);

  for (const gap of gaps.slice(0, 4)) {
    const district = gap.district || gap.area;
    const score = Number(gap.underservedScore || 0);

    if (district && score >= 60) {
      detections.push({
        type: "weak_competition_area",
        district,
        score,
        message: `Underserved-market signal for ${profileTitle} in ${district}: underservedScore ${score}/100 with ${gap.directCompetitors ?? "n/a"} direct competitors and ${gap.nearbyCompetitors ?? "n/a"} nearby competitors.`,
        evidence: {
          underservedScore: score,
          directCompetitors: gap.directCompetitors ?? null,
          nearbyCompetitors: gap.nearbyCompetitors ?? null,
          footTraffic: gap.footTraffic ?? null
        }
      });
    }
  }

  for (const district of districtRows.slice(0, 5)) {
    const districtName = district.district || district.name;
    const underservedScore = Number(district.underservedScore || 0);
    const nearbyCompetitors = Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0);
    const footTraffic = Number(district.footTraffic || 0);

    if (districtName && underservedScore >= 68 && nearbyCompetitors <= 2 && footTraffic >= 60) {
      detections.push({
        type: "weak_competition_area",
        district: districtName,
        score: underservedScore,
        message: `District gap signal for ${profileTitle} in ${districtName}: underservedScore ${underservedScore}/100, ${nearbyCompetitors} nearby competitors, and footTraffic ${footTraffic}/100.`,
        evidence: {
          underservedScore,
          nearbyCompetitors,
          footTraffic,
          opportunityScore: district.opportunityScore ?? district.score ?? null
        }
      });
    }
  }

  const thinCategories = categoryStats
    .filter((category) => Number(category.competitorCount) <= 1 && Number(category.priceSamples) >= 1)
    .slice(0, 3);

  for (const category of thinCategories) {
    detections.push({
      type: "missing_business_category",
      category: category.category,
      score: Math.max(55, 80 - Number(category.competitorCount || 0) * 18),
      message: `Thin category coverage signal: ${category.category} has ${category.competitorCount} competitors and ${category.priceSamples} price samples in the current market data.`,
      evidence: {
        competitorCount: category.competitorCount,
        priceSamples: category.priceSamples,
        averagePrice: category.averagePrice || null,
        averageRating: category.averageRating || null
      }
    });
  }

  if (pricing.sampleCount > 0 && pricing.sampleCount < 6) {
    detections.push({
      type: "underserved_pricing_segment",
      score: 58,
      message: `Pricing coverage gap: only ${pricing.sampleCount} verified price samples are available, so product-level pricing coverage is thin.`,
      evidence: {
        sampleCount: pricing.sampleCount,
        averagePrice: pricing.averagePrice || null,
        minPrice: pricing.minPrice || null,
        maxPrice: pricing.maxPrice || null
      }
    });
  }

  return dedupeDetections(detections)
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
    .slice(0, 8);
}

function buildComparativeSimulations({ analysis, analyticsContext }) {
  if (!analysis || analyticsContext?.state !== "analysis_loaded") {
    return [];
  }

  const districts = (analyticsContext.districtRankings || [])
    .filter((district) => district?.district || district?.name)
    .map(normalizeDistrictForSimulation);

  if (!districts.length || !analysis.probability) {
    return [];
  }

  const optimizedDistrict = districts.slice().sort((left, right) => right.opportunityScore - left.opportunityScore)[0];
  const unoptimizedDistrict = pickUnoptimizedDistrict(districts, optimizedDistrict);
  const baselineMetrics = analysis.probability.assumptions?.normalizedMetrics || {};
  const beforeProbability = estimateDistrictScenarioProbability({
    analysis,
    district: unoptimizedDistrict,
    baselineMetrics,
    mode: "before"
  });
  const afterProbability = estimateDistrictScenarioProbability({
    analysis,
    district: optimizedDistrict,
    baselineMetrics,
    mode: "after"
  });
  const riskComparison = buildRiskComparison({
    analysis,
    beforeDistrict: unoptimizedDistrict,
    afterDistrict: optimizedDistrict,
    beforeProbability,
    afterProbability
  });

  return [
    {
      id: "district_optimization",
      name: "District optimization simulation",
      before: {
        scenario: "Scenario A",
        label: "Before district optimization",
        district: unoptimizedDistrict.district,
        successProbability: beforeProbability,
        risk: scenarioRiskLabel({ analysis, district: unoptimizedDistrict }),
        opportunity: scenarioOpportunityLabel(unoptimizedDistrict),
        why: buildScenarioWhy({ district: unoptimizedDistrict, probability: beforeProbability }),
        assumptions: buildScenarioAssumptions({ analysis, district: unoptimizedDistrict })
      },
      after: {
        scenario: "Scenario B",
        label: "After district optimization",
        district: optimizedDistrict.district,
        successProbability: afterProbability,
        risk: scenarioRiskLabel({ analysis, district: optimizedDistrict }),
        opportunity: scenarioOpportunityLabel(optimizedDistrict),
        why: buildScenarioWhy({ district: optimizedDistrict, probability: afterProbability }),
        assumptions: buildScenarioAssumptions({ analysis, district: optimizedDistrict })
      },
      probabilityDelta: {
        points: afterProbability - beforeProbability,
        direction: afterProbability >= beforeProbability ? "improved" : "declined",
        explanation: buildProbabilityDeltaExplanation({ beforeDistrict: unoptimizedDistrict, afterDistrict: optimizedDistrict, beforeProbability, afterProbability })
      },
      riskComparison,
      guardrail: "Simulation uses current analytics and district metrics. It is directional, not a replacement for rerunning the scoring engine with new inputs."
    }
  ];
}

function normalizeDistrictForSimulation(district) {
  const nearbyCompetitors = Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0) || 0;
  const saturationScore = saturationRiskScore(district.saturation, nearbyCompetitors);

  return {
    district: district.district || district.name,
    rank: district.rank || null,
    opportunityScore: Number(district.opportunityScore ?? district.score ?? 0) || 0,
    saturation: district.saturation || "unknown",
    saturationScore,
    directCompetitors: Number(district.directCompetitors ?? district.densityCount ?? 0) || 0,
    nearbyCompetitors,
    footTraffic: Number(district.footTraffic || 0) || 0,
    underservedScore: Number(district.underservedScore || 0) || 0,
    rentIndex: Number(district.rentIndex || 0) || 0
  };
}

function pickUnoptimizedDistrict(districts, optimizedDistrict) {
  const highRisk = districts
    .filter((district) => district.district !== optimizedDistrict.district)
    .sort((left, right) =>
      right.saturationScore - left.saturationScore ||
      right.nearbyCompetitors - left.nearbyCompetitors ||
      left.opportunityScore - right.opportunityScore
    )[0];

  return highRisk || districts.slice().sort((left, right) => left.opportunityScore - right.opportunityScore)[0] || optimizedDistrict;
}

function estimateDistrictScenarioProbability({ analysis, district, baselineMetrics, mode }) {
  const budgetRealism = Number(baselineMetrics.budgetRealism ?? analysis.budgetPlan?.budgetRealismScore ?? 1) || 1;
  const competitorCount = clampScore(100 - Math.min(92, Number(analysis.market?.competitorCount || 0) * 5.8));
  const ratings = Number(baselineMetrics.ratings ?? 45) || 45;
  const estimatedDemand = clampScore(district.footTraffic * 0.46 + district.underservedScore * 0.42 + district.opportunityScore * 0.12);
  const pricingSpread = Number(baselineMetrics.pricingSpread ?? estimatePricingScore(analysis)) || 1;
  const districtActivity = clampScore(district.footTraffic * 0.68 + Math.max(0, 100 - district.rentIndex) * 0.12 + district.opportunityScore * 0.2);
  const businessDensity = clampScore(100 - Math.min(90, district.nearbyCompetitors * 22));
  const saturation = clampScore(100 - district.saturationScore);
  const marketGaps = clampScore(district.underservedScore * 0.58 + Math.max(0, 100 - district.directCompetitors * 22 - district.nearbyCompetitors * 10) * 0.42);
  const raw = weightedAverage([
    { value: budgetRealism, weight: 23 },
    { value: competitorCount, weight: 10 },
    { value: ratings, weight: 7 },
    { value: estimatedDemand, weight: 15 },
    { value: pricingSpread, weight: 7 },
    { value: districtActivity, weight: 12 },
    { value: businessDensity, weight: 9 },
    { value: saturation, weight: 10 },
    { value: marketGaps, weight: 7 }
  ]);
  const budgetCap = analysis.probability?.assumptions?.budgetCap?.success ?? 100;
  const directionalAdjustment = mode === "after" ? 2 : -2;

  return clampScore(Math.min(raw + directionalAdjustment, budgetCap));
}

function buildScenarioAssumptions({ analysis, district }) {
  return {
    districtOpportunityScore: district.opportunityScore,
    saturation: district.saturation,
    saturationRiskScore: district.saturationScore,
    directCompetitors: district.directCompetitors,
    nearbyCompetitors: district.nearbyCompetitors,
    footTraffic: district.footTraffic,
    underservedScore: district.underservedScore,
    budgetRiskLevel: analysis.budgetPlan?.budgetRiskLevel || "unknown",
    budgetShortfall: analysis.budgetPlan?.budgetShortfall || 0,
    priceSampleCount: analysis.stats?.sampleCount || 0,
    priceSpread: Math.max(0, Number(analysis.stats?.maxPrice || 0) - Number(analysis.stats?.minPrice || 0))
  };
}

function scenarioRiskLabel({ analysis, district }) {
  if (analysis.budgetPlan?.isBelowMinimum) {
    return "High capital risk";
  }

  if (district.saturationScore >= 70 || district.nearbyCompetitors >= 4) {
    return "High competition risk";
  }

  if (district.footTraffic < 45 || district.underservedScore < 40) {
    return "Weak demand risk";
  }

  return "Controlled pilot risk";
}

function scenarioOpportunityLabel(district) {
  if (district.opportunityScore >= 72 && district.underservedScore >= 60) {
    return "Strong opportunity";
  }

  if (district.opportunityScore >= 55) {
    return "Pilot opportunity";
  }

  return "Validation-only opportunity";
}

function buildScenarioWhy({ district, probability }) {
  return [
    `${district.district} scores ${district.opportunityScore}/100 on district opportunity`,
    `${district.nearbyCompetitors} nearby competitors`,
    `${district.footTraffic}/100 footTraffic`,
    `${district.underservedScore}/100 underservedScore`,
    `${district.saturation} saturation`,
    `scenario success probability ${probability}%`
  ].join("; ");
}

function buildRiskComparison({ analysis, beforeDistrict, afterDistrict, beforeProbability, afterProbability }) {
  const priceSampleCount = Number(analysis.stats?.sampleCount || 0);
  const priceSpread = Math.max(0, Number(analysis.stats?.maxPrice || 0) - Number(analysis.stats?.minPrice || 0));
  const priceSpreadRatio = analysis.stats?.avgPrice ? round(priceSpread / Math.max(1, analysis.stats.avgPrice), 2) : 0;
  const budgetRiskLevel = analysis.budgetPlan?.budgetRiskLevel || "unknown";
  const lowBudgetRiskBefore = analysis.budgetPlan?.isBelowMinimum
    ? `High: budget is ${analysis.budgetPlan.budgetShortfall} KZT below the ${analysis.budgetPlan.minimumViableBudget} KZT minimum viable threshold.`
    : `${budgetRiskLevel}: budget realism is ${analysis.budgetPlan?.budgetRealismScore ?? "n/a"}/100 with ${analysis.budgetPlan?.runwayMonths ?? "n/a"} months runway.`;

  return {
    oversaturation: {
      before: `${beforeDistrict.saturation} saturation, risk score ${beforeDistrict.saturationScore}/100, ${beforeDistrict.nearbyCompetitors} nearby competitors.`,
      after: `${afterDistrict.saturation} saturation, risk score ${afterDistrict.saturationScore}/100, ${afterDistrict.nearbyCompetitors} nearby competitors.`,
      impact: compareScores(beforeDistrict.saturationScore, afterDistrict.saturationScore, "lower")
    },
    lowBudget: {
      before: lowBudgetRiskBefore,
      after: lowBudgetRiskBefore,
      impact: analysis.budgetPlan?.isBelowMinimum
        ? "Budget remains the binding cap; district optimization cannot fully remove capital risk."
        : "Budget risk is unchanged by district selection, but stronger district economics can make the same capital base more usable."
    },
    weakDemand: {
      before: `footTraffic ${beforeDistrict.footTraffic}/100 and underservedScore ${beforeDistrict.underservedScore}/100.`,
      after: `footTraffic ${afterDistrict.footTraffic}/100 and underservedScore ${afterDistrict.underservedScore}/100.`,
      impact: compareScores(
        afterDistrict.footTraffic + afterDistrict.underservedScore,
        beforeDistrict.footTraffic + beforeDistrict.underservedScore,
        "higher"
      )
    },
    aggressiveCompetition: {
      before: `${beforeDistrict.directCompetitors} direct and ${beforeDistrict.nearbyCompetitors} nearby competitors.`,
      after: `${afterDistrict.directCompetitors} direct and ${afterDistrict.nearbyCompetitors} nearby competitors.`,
      impact: compareScores(beforeDistrict.directCompetitors + beforeDistrict.nearbyCompetitors, afterDistrict.directCompetitors + afterDistrict.nearbyCompetitors, "lower")
    },
    pricing: {
      before: `${priceSampleCount} price samples, spread ${priceSpread} KZT, spread ratio ${priceSpreadRatio}.`,
      after: `${priceSampleCount} price samples, suggested price ${analysis.recommendation?.suggestedPrice || "n/a"} KZT, pricing posture ${analysis.recommendation?.pricePosition || "not calculated"}.`,
      impact: priceSampleCount < 4
        ? "Pricing risk remains high because verified product-level evidence is thin."
        : priceSpreadRatio > 1.2
          ? "Pricing risk remains material because the observed market corridor is wide."
          : "Pricing risk is more controlled because the suggested price is tied to a usable observed corridor."
    },
    summary: `Probability changes by ${afterProbability - beforeProbability} points because optimized district selection changes saturation, demand, and competition inputs while budget and pricing constraints remain tied to the same analysis.`
  };
}

function buildProbabilityDeltaExplanation({ beforeDistrict, afterDistrict, beforeProbability, afterProbability }) {
  const parts = [];

  if (afterDistrict.saturationScore < beforeDistrict.saturationScore) {
    parts.push(`saturation risk falls from ${beforeDistrict.saturationScore}/100 to ${afterDistrict.saturationScore}/100`);
  }

  if (afterDistrict.nearbyCompetitors < beforeDistrict.nearbyCompetitors) {
    parts.push(`nearby competitors fall from ${beforeDistrict.nearbyCompetitors} to ${afterDistrict.nearbyCompetitors}`);
  }

  if (afterDistrict.footTraffic > beforeDistrict.footTraffic) {
    parts.push(`footTraffic rises from ${beforeDistrict.footTraffic}/100 to ${afterDistrict.footTraffic}/100`);
  }

  if (afterDistrict.underservedScore > beforeDistrict.underservedScore) {
    parts.push(`underserved demand rises from ${beforeDistrict.underservedScore}/100 to ${afterDistrict.underservedScore}/100`);
  }

  return parts.length
    ? `${parts.join(", ")}; success probability changes by ${afterProbability - beforeProbability} points.`
    : `the optimized district has a stronger composite district score; success probability changes by ${afterProbability - beforeProbability} points.`;
}

function estimatePricingScore(analysis) {
  const stats = analysis.stats || {};
  const priceSpreadPercent = stats.avgPrice
    ? ((stats.maxPrice - stats.minPrice) / Math.max(1, stats.avgPrice)) * 100
    : 0;

  return stats.sampleCount ? clampScore(72 - Math.min(42, priceSpreadPercent * 0.45) + Math.min(18, stats.sampleCount * 1.2)) : 1;
}

function saturationRiskScore(label, nearbyCompetitors = 0) {
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

  return clampScore(Number(nearbyCompetitors || 0) * 22);
}

function compareScores(before, after, betterDirection) {
  const delta = after - before;

  if (delta === 0) {
    return "No movement in this risk driver.";
  }

  const improved = betterDirection === "lower" ? after < before : after > before;
  return improved ? `Improved by ${Math.abs(delta)} points.` : `Worsened by ${Math.abs(delta)} points.`;
}

function weightedAverage(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const total = items.reduce((sum, item) => sum + (Number(item.value) || 0) * item.weight, 0);

  return totalWeight ? total / totalWeight : 0;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function scoreCount(count, thresholds) {
  if (count >= thresholds[2]) {
    return 100;
  }

  if (count >= thresholds[1]) {
    return 72;
  }

  if (count >= thresholds[0]) {
    return 42;
  }

  return 10;
}

function dedupeDetections(detections) {
  const seen = new Set();
  const unique = [];

  for (const detection of detections) {
    const key = [detection.type, detection.district, detection.category, detection.message].filter(Boolean).join("|");

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(detection);
    }
  }

  return unique;
}

function formatBusinessType(value) {
  return String(value || "business").replace(/_/g, " ");
}

function buildDistrictWhy(district) {
  const score = district.opportunityScore ?? district.score ?? 0;
  const competitors = district.nearbyCompetitors ?? district.competitorCountNearby ?? 0;
  const traffic = district.footTraffic ?? "unknown";

  return `Opportunity score ${score}, nearby competitors ${competitors}, traffic estimate ${traffic}.`;
}

function matches(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

module.exports = {
  classifyConsultantIntent,
  buildRecommendationEvidence,
  buildResponseIntelligence,
  buildAiConfidence,
  buildUnderservedMarketDetection,
  buildComparativeSimulations
};
