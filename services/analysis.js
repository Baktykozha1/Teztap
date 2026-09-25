const { dataVersion, getBusinessProfile } = require("../data/competitors");
const { fetchBusinessesFromOverpass } = require("./overpass");
const { fetchBusinessesFrom2GIS } = require("./twogis");
const { buildRealtimeAnalytics, buildPremiumAnalyticsEngine } = require("./analytics");
const { buildMapModel } = require("./map");
const { parseMarketPrices } = require("./parser");
const { createAiRecommendation } = require("./recommendations");
const { buildProbabilityModel } = require("./probability");
const { buildChartData } = require("./charts");
const { buildAiNarratives, buildGrowthInsights } = require("./narratives");
const { buildInvestorDecisionLayer } = require("./strategy");
const { buildOpportunityDiscovery } = require("./opportunityDiscovery");
const { buildProprietaryScoring } = require("./proprietaryScoring");
const { buildEcosystemWorkflows } = require("./ecosystemWorkflows");
const { buildCityEconomicIndicator } = require("./cityEconomicIndicator");
const { buildInvestmentModule } = require("./investmentModule");
const { buildMarketGapEngine } = require("./marketGapEngine");
const { listPlannedBusinesses } = require("./database");
const { buildProjectedMarketModel } = require("./projectedMarket");
const { buildPropertyRecommendations } = require("./properties");
const { getCityConfig } = require("../data/cities");
const { resolveOpportunityAreas } = require("./districts");

const DENSITY_RADIUS_KM = 1.1;

async function analyzeBusiness({ city, budget, businessType, country = "Kazakhstan", preferredLocation = null, targetAudience = null, businessFormat = null }) {
  const profile = getBusinessProfile(businessType);
  const [twoGisResult, liveBusinessResult] = await Promise.all([
    fetchBusinessesFrom2GIS({ city, businessType }),
    fetchBusinessesFromOverpass({ city, businessType })
  ]);
  const competitors = mergeBusinesses(twoGisResult.businesses, liveBusinessResult.businesses);
  let enrichedCompetitors = enrichCompetitors(competitors, profile);
  const structuredPrices = await parseMarketPrices({ city, businessType, competitors: enrichedCompetitors });
  enrichedCompetitors = applyStructuredPrices(enrichedCompetitors, structuredPrices.records, profile);
  const allPrices = structuredPrices.records.map((record) => record.price);
  const stats = calculatePriceStats(allPrices);
  const competitorsPerArea = countCompetitorsPerArea(enrichedCompetitors);
  const budgetPlan = calculateBudgetPlan({ budget, stats, profile });
  const areaResolution = resolveOpportunityAreas({ city, competitors: enrichedCompetitors });
  const opportunityAreas = scoreOpportunityAreas({
    areas: areaResolution.areas,
    competitors: enrichedCompetitors,
    budget: Number(budget),
    profile,
    stats,
    budgetPlan
  });
  const strategy = buildPricingStrategy({ stats, profile, competitorCount: competitors.length });
  const densityByArea = calculateAreaDensity(enrichedCompetitors);
  const businessCategoryStats = calculateBusinessCategoryStats({
    competitors: enrichedCompetitors,
    prices: structuredPrices.records,
    profile
  });
  const pricingIntelligence = buildPricingIntelligence({
    stats,
    prices: structuredPrices.records,
    strategy,
    profile
  });
  const bestLocation = opportunityAreas[0] || null;
  const opportunityScore = calculateOpportunityScore({
    competitors: enrichedCompetitors,
    stats,
    budgetPlan,
    bestLocation,
    opportunityAreas
  });
  const probability = buildProbabilityModel({
    profile,
    competitors: enrichedCompetitors,
    stats,
    budgetPlan,
    opportunityScore,
    opportunityAreas
  });
  const aiRecommendation = createAiRecommendation({
    bestLocation,
    stats,
    competitors: enrichedCompetitors,
    opportunityScore,
    strategy,
    budgetPlan
  });
  const analytics = buildRealtimeAnalytics({
    competitors: enrichedCompetitors,
    prices: structuredPrices.records,
    stats,
    budgetPlan,
    opportunityScore
  });
  const charts = buildChartData({
    profile,
    competitors: enrichedCompetitors,
    prices: structuredPrices.records,
    stats,
    budgetPlan,
    opportunityAreas
  });
  const districtMetrics = buildDistrictMetrics({
    opportunityAreas,
    competitorsPerArea,
    densityByArea
  });
  const saturationData = buildSaturationData({ opportunityAreas, densityByArea, opportunityScore });

  const result = {
    input: {
      country,
      city,
      budget,
      businessType,
      preferredLocation,
      targetAudience,
      businessFormat
    },
    profile: {
      title: profile.title,
      priceUnit: profile.priceUnit,
      priceLabels: profile.priceLabels,
      priceMeaning: profile.priceMeaning,
      minimumViableBudget: profile.minimumViableBudget
    },
    competitors: enrichedCompetitors,
    prices: structuredPrices.records,
    stats,
    market: {
      competitorCount: competitors.length,
      areaCounts: competitorsPerArea,
      priceSpread: stats.maxPrice - stats.minPrice,
      density: calculateMarketDensity(competitors.length),
      densityByArea,
      map: buildMapModel({
        competitors: enrichedCompetitors,
        opportunityAreas,
        fallbackCenter: getCityConfig(city)?.center || null
      }),
      districtCoverage: areaResolution
    },
    sources: {
      businesses: {
        primary: twoGisResult.source,
        fallback: liveBusinessResult.source
      },
      city: {
        name: getCityConfig(city)?.name || city,
        sourceReadiness: getCityConfig(city)?.sourceReadiness || "unsupported",
        districtSignals: areaResolution.source
      },
      prices: structuredPrices.sourceSummary
    },
    analytics,
    charts,
    districtMetrics,
    pricingIntelligence,
    businessCategoryStats,
    saturationData,
    budgetPlan,
    recommendation: {
      bestArea: bestLocation?.name || determineBestArea(competitorsPerArea),
      bestLocation,
      suggestedPrice: strategy.suggestedPrice,
      pricePosition: strategy.pricePosition,
      confidence: calculateConfidence(competitors.length, stats.sampleCount),
      explanation: aiRecommendation.explanation,
      pricingStrategy: aiRecommendation.pricingStrategy,
      saturation: opportunityScore.saturation,
      underservedDistricts: opportunityScore.underservedDistricts,
      nextActions: buildNextActions({ competitors, stats, budgetPlan, bestLocation })
    },
    opportunityScore,
    probability,
    probabilityScores: {
      success: probability.successProbability,
      profitability: probability.profitabilityProbability,
      survival: probability.survivalProbability,
      level: probability.level,
      assumptions: probability.assumptions,
      formulas: probability.formulas
    },
    opportunityAreas,
    meta: {
      dataVersion,
      generatedAt: new Date().toISOString(),
      refreshSeconds: 45
    }
  };

  result.strategicIntelligence = buildStrategicIntelligence({ result });
  result.growthInsights = buildGrowthInsights({ result });
  result.investorDecision = buildInvestorDecisionLayer({ result });
  result.analyticsEngine = buildPremiumAnalyticsEngine({ result });
  result.proprietaryScoring = buildProprietaryScoring({ result });
  result.opportunityDiscovery = buildOpportunityDiscovery({ result });
  result.marketGapEngine = buildMarketGapEngine({ result });
  result.cityEconomicIndicator = buildCityEconomicIndicator({ result });
  result.investmentModule = buildInvestmentModule({ result });
  result.ecosystemWorkflows = buildEcosystemWorkflows({ result });
  result.plannedBusinesses = await listPlannedBusinesses({
    city,
    category: businessType,
    status: ["PLANNED", "VERIFIED", "OPEN"],
    includePrivate: false,
    limit: 250
  });
  result.projectedMarket = buildProjectedMarketModel({
    analysis: result,
    plannedBusinesses: result.plannedBusinesses
  });
  result.propertyMarketplace = await buildPropertyRecommendations({ analysis: result });
  result.aiNarratives = buildAiNarratives({ result });

  return result;
}

function collectPrices(competitors) {
  return competitors.flatMap((competitor) => competitor.priceSamples.map((sample) => sample.value));
}

function mergeBusinesses(...businessGroups) {
  const merged = [];
  const seen = new Set();

  businessGroups.flat().forEach((business) => {
    const key = business.coordinates
      ? `${business.name}|${round(business.coordinates.lat, 3)}|${round(business.coordinates.lng, 3)}`
      : `${business.name}|${business.area}|${business.address}`;
    const normalizedKey = key.toLowerCase();

    if (!seen.has(normalizedKey)) {
      seen.add(normalizedKey);
      merged.push(business);
    }
  });

  return merged;
}

function applyStructuredPrices(competitors, records, profile) {
  return competitors.map((competitor) => {
    const recordSamples = records
      .filter((record) => record.businessName.toLowerCase() === competitor.name.toLowerCase())
      .map((record) => ({
        productName: record.productName,
        label: record.productName,
        category: record.category,
        value: record.price,
        price: record.price,
        sourceName: record.sourceName,
        sourceUrl: record.sourceUrl,
        sourceUpdatedAt: record.sourceUpdatedAt,
        confidence: record.confidence
      }));

    return {
      ...competitor,
      category: competitor.category || profile.title,
      priceSamples: recordSamples.length ? recordSamples : competitor.priceSamples
    };
  });
}

function calculatePriceStats(prices) {
  if (!prices.length) {
    return {
      avgPrice: 0,
      minPrice: 0,
      maxPrice: 0,
      sampleCount: 0
    };
  }

  const total = prices.reduce((sum, price) => sum + price, 0);

  return {
    avgPrice: Math.round(total / prices.length),
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    sampleCount: prices.length
  };
}

function countCompetitorsPerArea(competitors) {
  return competitors.reduce((counts, competitor) => {
    counts[competitor.area] = (counts[competitor.area] || 0) + 1;
    return counts;
  }, {});
}

function determineBestArea(competitorsPerArea) {
  const entries = Object.entries(competitorsPerArea);

  if (!entries.length) {
    return null;
  }

  entries.sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]));
  return entries[0][0];
}

function suggestPrice(avgPrice) {
  if (!avgPrice) {
    return 0;
  }

  return Math.round(avgPrice * 0.95);
}

function calculateConfidence(competitorCount, sampleCount) {
  if (competitorCount >= 6 && sampleCount >= 8) {
    return "High";
  }

  if (competitorCount >= 3) {
    return "Medium";
  }

  return "Low";
}

function enrichCompetitors(competitors, profile) {
  return competitors.map((competitor) => ({
    ...competitor,
    priceSamples: getPriceSamples(competitor, profile)
  }));
}

function getPriceSamples(competitor, profile) {
  if (Array.isArray(competitor.samples) && competitor.samples.length) {
    return competitor.samples.map((sample, index) => ({
      label: sample.label || profile.priceLabels[index] || `Segment ${index + 1}`,
      productName: sample.label || profile.priceLabels[index] || `Segment ${index + 1}`,
      category: sample.category || profile.priceLabels[index] || "price sample",
      value: sample.value,
      price: sample.value,
      sourceName: competitor.sourceName,
      sourceUrl: competitor.sourceUrl,
      sourceUpdatedAt: competitor.sourceUpdatedAt
    }));
  }

  if (Array.isArray(competitor.prices) && competitor.prices.length) {
    return competitor.prices.map((price, index) => ({
      label: profile.priceLabels[index] || `Segment ${index + 1}`,
      productName: profile.priceLabels[index] || `Segment ${index + 1}`,
      category: profile.priceLabels[index] || "price sample",
      value: price,
      price,
      sourceName: competitor.sourceName,
      sourceUrl: competitor.sourceUrl,
      sourceUpdatedAt: competitor.sourceUpdatedAt
    }));
  }

  return [];
}

function calculateBudgetPlan({ budget, stats, profile }) {
  const minimumViableBudget = Number(profile.minimumViableBudget) || 5000000;

  if (!budget) {
    return {
      inputBudget: Number(budget) || 0,
      startupReserve: 0,
      usableBudget: 0,
      monthlyOperatingCost: 0,
      runwayMonths: 0,
      breakEvenTransactions: null,
      minimumViableBudget,
      budgetAdequacyRatio: 0,
      budgetRealismScore: 1,
      budgetShortfall: minimumViableBudget,
      isBelowMinimum: true,
      budgetRiskLevel: "Critical",
      budgetSignal: "Budget is not realistic"
    };
  }

  const startupReserve = Math.round(budget * profile.launchReserveRate);
  const usableBudget = Math.max(0, budget - startupReserve);
  const realisticCostBase = Math.max(Number(budget) || 0, minimumViableBudget);
  const monthlyOperatingCost = Math.round(realisticCostBase * profile.monthlyFixedCostRate);
  const priceBasis = stats.avgPrice || 0;
  const grossProfitPerTransaction = priceBasis ? Math.max(1, Math.round(priceBasis * profile.targetMargin)) : 0;
  const breakEvenTransactions = grossProfitPerTransaction ? Math.ceil(monthlyOperatingCost / grossProfitPerTransaction) : null;
  const runwayMonths = monthlyOperatingCost ? Math.max(0, Math.floor(usableBudget / monthlyOperatingCost)) : 0;
  const budgetAdequacyRatio = round(budget / minimumViableBudget, 3);
  const budgetRealismScore = calculateBudgetRealismScore({ budget, minimumViableBudget, runwayMonths });
  const isBelowMinimum = budget < minimumViableBudget;
  const budgetShortfall = Math.max(0, minimumViableBudget - budget);

  return {
    inputBudget: Number(budget),
    startupReserve,
    usableBudget,
    monthlyOperatingCost,
    grossProfitPerTransaction,
    breakEvenTransactions,
    plannedTransactions: profile.monthlyTransactions,
    runwayMonths,
    minimumViableBudget,
    budgetAdequacyRatio,
    budgetRealismScore,
    budgetShortfall,
    isBelowMinimum,
    budgetRiskLevel: getBudgetRiskLevel({ budgetAdequacyRatio, runwayMonths }),
    budgetSignal: isBelowMinimum
      ? `Budget is ${budgetShortfall} KZT below the minimum viable ${minimumViableBudget} KZT threshold`
      : runwayMonths >= 6
        ? "Healthy reserve"
        : "Short reserve"
  };
}

function calculateBudgetRealismScore({ budget, minimumViableBudget, runwayMonths }) {
  const adequacyRatio = budget / Math.max(1, minimumViableBudget);
  const capitalScore = clampScore(adequacyRatio * 100);
  const runwayScore = clampScore((runwayMonths / 9) * 100);
  const severeShortfallPenalty = adequacyRatio < 0.25 ? adequacyRatio * 0.55 : adequacyRatio < 0.75 ? 0.72 : 1;

  return clampScore((capitalScore * 0.72 + runwayScore * 0.28) * severeShortfallPenalty);
}

function getBudgetRiskLevel({ budgetAdequacyRatio, runwayMonths }) {
  if (budgetAdequacyRatio < 0.25) {
    return "Critical";
  }

  if (budgetAdequacyRatio < 0.75 || runwayMonths < 3) {
    return "High";
  }

  if (budgetAdequacyRatio < 1 || runwayMonths < 6) {
    return "Elevated";
  }

  return "Controlled";
}

function buildPricingStrategy({ stats, profile, competitorCount }) {
  if (!stats.avgPrice) {
    return {
      suggestedPrice: 0,
      pricePosition: "Needs verified prices",
      explanation:
        "The platform found real competitors, but no verified public price samples for this business type. Use the map and density score for location decisions, then add receipts or price lists before setting a launch price."
    };
  }

  if (!Number.isFinite(stats.sampleCount) || stats.sampleCount < 1) {
    return {
      suggestedPrice: 0,
      pricePosition: "Needs verified prices",
      explanation: "No verified menu, catalog, receipt, or public price-list records were available. The platform will not infer a launch price."
    };
  }

  const suggestedPrice = suggestPrice(stats.avgPrice);
  const discount = stats.avgPrice - suggestedPrice;
  const pricePosition = competitorCount >= 5 ? "Slightly below market average" : "Careful market entry";

  return {
    suggestedPrice,
    pricePosition,
    explanation:
      `Observed average price is ${stats.avgPrice} KZT across ${stats.sampleCount} public price samples. ` +
      `A launch price near ${suggestedPrice} KZT is about ${discount} KZT below the observed average while preserving a target gross margin near ${Math.round(profile.targetMargin * 100)}%.`
  };
}

function calculateMarketDensity(competitorCount) {
  if (competitorCount >= 6) {
    return "High competition";
  }

  if (competitorCount >= 3) {
    return "Moderate competition";
  }

  return "Low competition";
}

function calculateAreaDensity(competitors) {
  return Object.entries(countCompetitorsPerArea(competitors))
    .map(([area, count]) => ({
      area,
      count,
      level: count >= 3 ? "high" : count === 2 ? "medium" : "low"
    }))
    .sort((left, right) => right.count - left.count || left.area.localeCompare(right.area));
}

function buildDistrictMetrics({ opportunityAreas, competitorsPerArea, densityByArea }) {
  return opportunityAreas.map((area, index) => {
    const directCompetitors = competitorsPerArea[area.name] || 0;
    const density = densityByArea.find((item) => item.area === area.name);

    return {
      rank: index + 1,
      district: area.name,
      opportunityScore: area.score,
      saturation: area.saturation,
      densityLevel: area.densityLevel,
      directCompetitors,
      nearbyCompetitors: area.competitorCountNearby,
      underservedScore: area.underservedScore,
      footTraffic: area.footTraffic,
      rentIndex: area.rentIndex,
      signalCoverage: area.signalCoverage,
      observedOnly: Boolean(area.observedOnly),
      anchors: area.anchors || [],
      densityCount: density?.count || directCompetitors,
      reason: area.reason
    };
  });
}

function buildSaturationData({ opportunityAreas, densityByArea, opportunityScore }) {
  return {
    overall: opportunityScore.saturation,
    districts: opportunityAreas.map((area) => ({
      district: area.name,
      saturation: area.saturation,
      nearbyCompetitors: area.competitorCountNearby,
      underservedScore: area.underservedScore,
      densityLevel: area.densityLevel
    })),
    densityByArea
  };
}

function buildPricingIntelligence({ stats, prices, strategy, profile }) {
  const categoryStats = calculatePriceStatsByCategory(prices);
  const evidence = stats.sampleCount >= 8 ? "strong" : stats.sampleCount >= 4 ? "usable" : "thin";

  return {
    unit: profile.priceUnit,
    meaning: profile.priceMeaning,
    evidence,
    sampleCount: stats.sampleCount,
    averagePrice: stats.avgPrice,
    minPrice: stats.minPrice,
    maxPrice: stats.maxPrice,
    suggestedPrice: strategy.suggestedPrice,
    pricePosition: strategy.pricePosition,
    categoryStats
  };
}

function calculateBusinessCategoryStats({ competitors, prices, profile }) {
  const competitorCategories = new Map();

  for (const competitor of competitors) {
    const key = competitor.category || profile.title;
    const current = competitorCategories.get(key) || {
      category: key,
      competitorCount: 0,
      ratedCompetitors: 0,
      ratingTotal: 0,
      ratingWeight: 0
    };
    const rating = Number(competitor.rating);
    const ratingWeight = Math.max(1, Math.min(200, Number(competitor.ratingsCount) || 1));

    current.competitorCount += 1;
    if (Number.isFinite(rating) && rating > 0) {
      current.ratedCompetitors += 1;
      current.ratingTotal += rating * ratingWeight;
      current.ratingWeight += ratingWeight;
    }

    competitorCategories.set(key, current);
  }

  const priceCategories = calculatePriceStatsByCategory(prices).reduce((groups, category) => {
    groups[category.category] = category;
    return groups;
  }, {});

  return Array.from(competitorCategories.values())
    .map((category) => ({
      category: category.category,
      competitorCount: category.competitorCount,
      ratedCompetitors: category.ratedCompetitors,
      averageRating: category.ratingWeight ? round(category.ratingTotal / category.ratingWeight, 1) : 0,
      priceSamples: priceCategories[category.category]?.sampleCount || 0,
      averagePrice: priceCategories[category.category]?.averagePrice || 0
    }))
    .sort((left, right) => right.competitorCount - left.competitorCount || left.category.localeCompare(right.category));
}

function calculatePriceStatsByCategory(prices) {
  const groups = new Map();

  for (const record of prices) {
    const key = record.category || "Uncategorized";
    const current = groups.get(key) || {
      category: key,
      sampleCount: 0,
      total: 0,
      minPrice: Number.POSITIVE_INFINITY,
      maxPrice: 0
    };
    const price = Number(record.price) || 0;

    current.sampleCount += 1;
    current.total += price;
    current.minPrice = Math.min(current.minPrice, price);
    current.maxPrice = Math.max(current.maxPrice, price);
    groups.set(key, current);
  }

  return Array.from(groups.values())
    .map((group) => ({
      category: group.category,
      sampleCount: group.sampleCount,
      averagePrice: Math.round(group.total / group.sampleCount),
      minPrice: group.minPrice,
      maxPrice: group.maxPrice
    }))
    .sort((left, right) => right.sampleCount - left.sampleCount || left.category.localeCompare(right.category));
}

function buildStrategicIntelligence({ result }) {
  const bestDistrict = result.districtMetrics[0] || null;
  const weakestDistrict = result.districtMetrics
    .slice()
    .sort((left, right) => right.underservedScore - left.underservedScore || left.nearbyCompetitors - right.nearbyCompetitors)[0];
  const topCompetitors = result.competitors
    .slice()
    .sort((left, right) => (Number(right.ratingsCount) || 0) - (Number(left.ratingsCount) || 0))
    .slice(0, 5)
    .map((competitor) => ({
      name: competitor.name,
      district: competitor.area,
      rating: Number(competitor.rating) || 0,
      ratingsCount: Number(competitor.ratingsCount) || 0,
      priceSamples: (competitor.priceSamples || []).length,
      strategicSignal: getCompetitorSignal(competitor)
    }));
  const riskyDistricts = result.districtMetrics.filter((district) => district.saturation === "high" || district.nearbyCompetitors >= 4);
  const categoryLeaders = result.businessCategoryStats.slice(0, 5);
  const priceSpread = result.stats.maxPrice - result.stats.minPrice;
  const pricingRisk = result.stats.sampleCount < 4
    ? "Thin price evidence"
    : priceSpread > result.stats.avgPrice * 1.2
      ? "Wide pricing dispersion"
      : "Usable pricing corridor";

  return {
    swot: {
      strengths: [
        bestDistrict
          ? `${bestDistrict.district} ranks #${bestDistrict.rank} with ${bestDistrict.opportunityScore}/100 opportunity and ${bestDistrict.underservedScore}/100 underserved demand.`
          : "District coverage exists but needs stronger opportunity-area data.",
        `${result.probability.profitabilityProbability}% profitability probability with ${result.budgetPlan.runwayMonths} months modeled runway.`
      ],
      weaknesses: [
        `${result.market.density} with ${result.market.competitorCount} detected competitors.`,
        result.budgetPlan.isBelowMinimum
          ? `Budget is ${result.budgetPlan.budgetShortfall} KZT below the minimum viable ${result.budgetPlan.minimumViableBudget} KZT threshold for ${result.profile.title}.`
          : `${result.budgetPlan.budgetRiskLevel} capital risk with ${result.budgetPlan.runwayMonths} months modeled runway.`,
        result.stats.sampleCount
          ? `Pricing is based on ${result.stats.sampleCount} product-level samples, so category depth should keep expanding.`
          : "No verified product-level prices were found; pricing decisions require field validation."
      ],
      opportunities: [
        weakestDistrict
          ? `${weakestDistrict.district} shows a ${weakestDistrict.underservedScore}/100 market-gap signal with ${weakestDistrict.nearbyCompetitors} nearby competitors.`
          : "Add more districts to identify stronger market gaps.",
        result.recommendation.suggestedPrice
          ? `Launch around ${result.recommendation.suggestedPrice} KZT to stay below the observed ${result.stats.avgPrice} KZT average.`
          : "Collect competitor menus and receipts to unlock pricing-led positioning."
      ],
      threats: [
        result.budgetPlan.isBelowMinimum
          ? `A budget of ${result.budgetPlan.inputBudget} KZT is not realistic for opening this type of business without reducing scope or raising capital.`
          : `${result.budgetPlan.budgetRiskLevel} budget risk can still compress the launch runway if costs overrun.`,
        riskyDistricts[0]
          ? `${riskyDistricts[0].district} is ${riskyDistricts[0].saturation} saturation with ${riskyDistricts[0].nearbyCompetitors} nearby competitors.`
          : "Execution risk is concentrated in lease terms, conversion, and repeat demand.",
        result.budgetPlan.runwayMonths < 6
          ? "Runway is below six months, increasing launch fragility."
          : "Higher-rated incumbents can compress differentiation unless service quality is visibly superior."
      ]
    },
    competitorAnalysis: {
      marketDensity: result.market.density,
      competitorCount: result.market.competitorCount,
      topCompetitors,
      weakestCompetitionDistrict: result.opportunityScore.underservedDistricts?.[0] || null,
      interpretation: `${result.market.competitorCount} competitors create ${result.market.density.toLowerCase()}; entry should prioritize districts where density is low and underserved demand is high.`
    },
    riskAnalysis: [
      {
        label: "Saturation risk",
        level: riskyDistricts.length ? "High" : result.opportunityScore.saturation,
        evidence: riskyDistricts.length
          ? `${riskyDistricts.length} district(s) show high saturation or 4+ nearby competitors.`
          : `Overall saturation is ${result.opportunityScore.saturation}.`
      },
      {
        label: "Pricing risk",
        level: pricingRisk,
        evidence: result.stats.sampleCount
          ? `${result.stats.sampleCount} samples, ${result.stats.minPrice}-${result.stats.maxPrice} KZT observed range.`
          : "No verified product-level samples."
      },
      {
        label: "Capital risk",
        level: result.budgetPlan.budgetRiskLevel,
        evidence: result.budgetPlan.isBelowMinimum
          ? `Budget is ${result.budgetPlan.budgetShortfall} KZT below the ${result.budgetPlan.minimumViableBudget} KZT minimum viable threshold; budget realism is ${result.budgetPlan.budgetRealismScore}/100.`
          : `${result.budgetPlan.runwayMonths} months runway, ${result.budgetPlan.breakEvenTransactions ?? "n/a"} break-even sales/mo, and budget realism ${result.budgetPlan.budgetRealismScore}/100.`
      }
    ],
    pricingIntelligence: {
      ...result.pricingIntelligence,
      interpretation: result.pricingIntelligence.sampleCount
        ? `Observed corridor is ${result.stats.minPrice}-${result.stats.maxPrice} KZT with ${result.stats.avgPrice} KZT average; recommended entry is ${result.recommendation.suggestedPrice} KZT.`
        : "Pricing intelligence is location-led until product-level samples are collected."
    },
    categoryIntelligence: {
      categories: categoryLeaders,
      interpretation: categoryLeaders.length
        ? `${categoryLeaders[0].category} has the deepest detected category presence with ${categoryLeaders[0].competitorCount} competitors.`
        : "Category intelligence needs more competitor classification."
    },
    marketGapDetection: result.opportunityScore.underservedDistricts.slice(0, 5).map((district) => ({
      district: district.area,
      underservedScore: district.underservedScore,
      directCompetitors: district.directCompetitors,
      nearbyCompetitors: district.nearbyCompetitors,
      footTraffic: district.footTraffic,
      signal: district.underservedScore >= 70 ? "Strong gap" : district.underservedScore >= 55 ? "Emerging gap" : "Weak gap"
    }))
  };
}

function getCompetitorSignal(competitor) {
  const rating = Number(competitor.rating) || 0;
  const reviews = Number(competitor.ratingsCount) || 0;

  if (rating >= 4.6 && reviews >= 500) {
    return "Strong incumbent";
  }

  if (rating < 4 && reviews >= 100) {
    return "Service gap opportunity";
  }

  if ((competitor.priceSamples || []).length) {
    return "Price-visible competitor";
  }

  return "Presence signal";
}

function scoreOpportunityAreas({ areas, competitors, budget, profile, stats, budgetPlan }) {
  const marketRating = calculateAverageRating(competitors);
  const saturationByArea = calculateSaturationByArea(competitors);
  const pricePower = stats.avgPrice ? normalizeScore(stats.avgPrice, stats.avgPrice * 0.65, stats.avgPrice * 1.35) : null;
  const profitability = stats.avgPrice ? calculateProfitabilityScore({ budgetPlan, stats }) : null;
 
  return areas
    .map((area) => {
      const nearbyCompetitors = competitors
        .filter((competitor) => competitor.coordinates)
        .map((competitor) => ({
          name: competitor.name,
          area: competitor.area,
          distanceKm: round(distanceKm(area.coordinates, competitor.coordinates), 2)
        }))
        .filter((competitor) => competitor.distanceKm <= DENSITY_RADIUS_KM)
        .sort((left, right) => left.distanceKm - right.distanceKm);

      const densityPenalty = Math.min(100, nearbyCompetitors.length * 22);
      const rentFit = Number.isFinite(area.rentIndex) ? Math.max(0, 100 - area.rentIndex) : null;
      const budgetFit = budgetPlan.budgetRealismScore || calculateBudgetRealismScore({
        budget: budget || 0,
        minimumViableBudget: profile.minimumViableBudget,
        runwayMonths: budgetPlan.runwayMonths || 0
      });
      const areaSaturation = saturationByArea[area.name] || nearbyCompetitors.length;
      const underservedScore = Math.max(0, 100 - areaSaturation * 24);
      const ratingGap = marketRating ? Math.max(0, 5 - marketRating) * 16 : null;
      const signals = [
        { value: area.footTraffic, weight: 0.22 },
        { value: rentFit, weight: 0.14 },
        { value: budgetFit, weight: 0.12 },
        { value: 100 - densityPenalty, weight: 0.2 },
        { value: underservedScore, weight: 0.16 },
        { value: pricePower, weight: 0.08 },
        { value: profitability, weight: 0.08 },
        { value: ratingGap, weight: 0.04 }
      ].filter((signal) => Number.isFinite(signal.value));
      const signalWeight = signals.reduce((total, signal) => total + signal.weight, 0);
      const score = signalWeight
        ? clampScore(signals.reduce((total, signal) => total + signal.value * signal.weight, 0) / signalWeight)
        : null;

      return {
        ...area,
        score,
        signalCoverage: round(signalWeight * 100, 0),
        densityLevel: densityPenalty >= 66 ? "high" : densityPenalty >= 33 ? "medium" : "low",
        saturation: areaSaturation >= 4 ? "high" : areaSaturation >= 2 ? "medium" : "low",
        underservedScore,
        nearbyCompetitors,
        competitorCountNearby: nearbyCompetitors.length,
        reason: buildAreaReason({ area, nearbyCompetitors, score, underservedScore, pricePower, profitability, signalWeight })
      };
    })
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
}

function buildAreaReason({ area, nearbyCompetitors, score, underservedScore, pricePower, profitability, signalWeight }) {
  const densityText = nearbyCompetitors.length
    ? `${nearbyCompetitors.length} competitors within ${DENSITY_RADIUS_KM} km`
    : `no direct competitors within ${DENSITY_RADIUS_KM} km`;

  const signals = [densityText, `competition space ${underservedScore}/100`];

  if (Number.isFinite(pricePower)) {
    signals.push(`price power ${pricePower}/100`);
  }

  if (Number.isFinite(profitability)) {
    signals.push(`profitability ${profitability}/100`);
  }

  if (signalWeight < 1) {
    signals.push(`${round(signalWeight * 100, 0)}% of location inputs available`);
  }

  return `${area.name} scores ${score}/100: ${signals.join(", ")}.`;
}

function calculateOpportunityScore({ competitors, stats, budgetPlan, bestLocation, opportunityAreas }) {
  const competitorCount = competitors.length;
  const competitionScore = clampScore(100 - Math.min(90, competitorCount * 4));
  const pricingScore = stats.avgPrice
    ? clampScore(normalizeScore(stats.avgPrice, stats.minPrice || stats.avgPrice * 0.7, stats.maxPrice || stats.avgPrice * 1.3))
    : null;
  const ratingAverage = calculateAverageRating(competitors);
  const ratingOpportunityScore = ratingAverage ? clampScore((5 - ratingAverage) * 22 + 18) : null;
  const underservedDistricts = calculateUnderservedDistricts({ competitors, opportunityAreas });
  const underservedScore = underservedDistricts.length
    ? clampScore(45 + Math.min(45, underservedDistricts[0].underservedScore * 0.45))
    : null;
  const saturationScore = bestLocation ? clampScore(100 - bestLocation.competitorCountNearby * 22) : competitionScore;
  const profitabilityScore = stats.avgPrice ? calculateProfitabilityScore({ budgetPlan, stats }) : null;
  const budgetRealismScore = budgetPlan.budgetRealismScore || 1;
  const scoreSignals = [
    { value: competitionScore, weight: 0.12 },
    { value: pricingScore, weight: 0.1 },
    { value: ratingOpportunityScore, weight: 0.08 },
    { value: underservedScore, weight: 0.12 },
    { value: saturationScore, weight: 0.1 },
    { value: profitabilityScore, weight: 0.12 },
    { value: budgetRealismScore, weight: 0.36 }
  ].filter((signal) => Number.isFinite(signal.value));
  const signalWeight = scoreSignals.reduce((total, signal) => total + signal.weight, 0);
  const rawScore = signalWeight
    ? clampScore(scoreSignals.reduce((total, signal) => total + signal.value * signal.weight, 0) / signalWeight)
    : 0;
  const score = budgetPlan.isBelowMinimum
    ? Math.min(rawScore, calculateBudgetOpportunityCap({ budgetPlan, profitabilityScore: profitabilityScore || 0, saturationScore }))
    : rawScore;

  return {
    score,
    label: budgetPlan.isBelowMinimum
      ? "Financially underfunded"
      : score >= 75 ? "Strong opportunity" : score >= 55 ? "Promising with risks" : "High-risk market",
    saturation: saturationScore >= 70 ? "Low saturation" : saturationScore >= 45 ? "Moderate saturation" : "High saturation",
    bestDistrict: bestLocation?.name || underservedDistricts[0]?.area || null,
    factors: {
      competition: competitionScore,
      pricing: pricingScore,
      ratingGap: ratingOpportunityScore,
      underservedDemand: underservedScore,
      saturation: saturationScore,
      profitability: profitabilityScore,
      budgetRealism: budgetRealismScore
    },
    signalCoverage: round(signalWeight * 100, 0),
    assumptions: {
      averageRating: round(ratingAverage || 0, 1),
      competitorCount,
      averagePrice: stats.avgPrice,
      breakEvenTransactions: budgetPlan.breakEvenTransactions,
      minimumViableBudget: budgetPlan.minimumViableBudget,
      budgetAdequacyRatio: budgetPlan.budgetAdequacyRatio,
      budgetShortfall: budgetPlan.budgetShortfall
    },
    underservedDistricts
  };
}

function calculateBudgetOpportunityCap({ budgetPlan, profitabilityScore, saturationScore }) {
  const adequacyScore = clampScore((Number(budgetPlan.budgetAdequacyRatio) || 0) * 100);
  return clampScore(
    (Number(budgetPlan.budgetRealismScore) || 1) * 0.52 +
      adequacyScore * 0.18 +
      profitabilityScore * 0.18 +
      saturationScore * 0.12
  );
}

function calculateUnderservedDistricts({ competitors, opportunityAreas }) {
  const areaCounts = countCompetitorsPerArea(competitors);

  return opportunityAreas
    .map((area) => {
      const directCount = areaCounts[area.name] || 0;
      const nearbyCount = area.competitorCountNearby || 0;
      const competitionSpace = clampScore(100 - directCount * 24 - nearbyCount * 12);
      const hasFootTraffic = Number.isFinite(area.footTraffic);
      const underservedScore = hasFootTraffic
        ? clampScore(area.footTraffic * 0.55 + competitionSpace * 0.45)
        : competitionSpace;

      return {
        area: area.name,
        directCompetitors: directCount,
        nearbyCompetitors: nearbyCount,
        footTraffic: area.footTraffic,
        signalCoverage: hasFootTraffic ? 100 : 45,
        underservedScore
      };
    })
    .sort((left, right) => right.underservedScore - left.underservedScore || left.area.localeCompare(right.area));
}

function calculateProfitabilityScore({ budgetPlan, stats }) {
  if (!budgetPlan.monthlyOperatingCost) {
    return 35;
  }

  const transactionCoverage = budgetPlan.plannedTransactions && budgetPlan.breakEvenTransactions
    ? clampScore((budgetPlan.plannedTransactions / Math.max(1, budgetPlan.breakEvenTransactions)) * 35)
    : 1;
  const runwayScore = clampScore((budgetPlan.runwayMonths / 9) * 100);
  const marginSignal = stats.avgPrice ? clampScore((budgetPlan.grossProfitPerTransaction / Math.max(1, stats.avgPrice)) * 420) : 45;

  return clampScore(transactionCoverage * 0.38 + runwayScore * 0.34 + marginSignal * 0.28);
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

  return weightedTotal / totalWeight;
}

function calculateSaturationByArea(competitors) {
  return competitors.reduce((counts, competitor) => {
    counts[competitor.area] = (counts[competitor.area] || 0) + 1;
    return counts;
  }, {});
}

function normalizeScore(value, min, max) {
  if (!Number.isFinite(value) || max <= min) {
    return 50;
  }

  return clampScore(((value - min) / (max - min)) * 100);
}

function clampScore(value) {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function buildNextActions({ competitors, stats, budgetPlan, bestLocation }) {
  if (!competitors.length) {
    return [
      "Add verified competitors for this city before making a launch decision.",
      "Capture at least 8 public price samples or receipts for the selected business type."
    ];
  }

  const actions = [
    bestLocation
      ? `Shortlist ${bestLocation.name}: ${bestLocation.reason}`
      : "Compare two low-density areas before signing a lease.",
    budgetPlan.breakEvenTransactions
      ? `Check whether the business can reach ${budgetPlan.breakEvenTransactions} monthly sales for break-even.`
      : "Collect verified price samples before calculating break-even sales volume."
  ];

  if (stats.maxPrice) {
    actions.push(`Do not launch above ${stats.maxPrice} KZT unless the offer is clearly differentiated.`);
  } else {
    actions.push("Collect verified price samples before deciding the first menu or basket price.");
  }

  if (budgetPlan.isBelowMinimum) {
    actions.push(`Increase capital by at least ${budgetPlan.budgetShortfall} KZT or switch to a lower-cost business format before launch.`);
  } else if (budgetPlan.runwayMonths < 6) {
    actions.push("Reduce launch cost or increase capital: runway below 6 months is fragile.");
  } else {
    actions.push("Budget runway is strong enough to test one location without forcing immediate heavy discounting.");
  }

  return actions;
}

function distanceKm(left, right) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(right.lat - left.lat);
  const dLng = toRadians(right.lng - left.lng);
  const lat1 = toRadians(left.lat);
  const lat2 = toRadians(right.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

module.exports = {
  analyzeBusiness
};
