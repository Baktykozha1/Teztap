function buildOpportunityDiscovery({ result }) {
  const bestDistrict = result.districtMetrics?.[0] || result.opportunityAreas?.[0] || null;
  const strongestGap = result.analyticsEngine?.marketGaps?.strongestGap || result.strategicIntelligence?.marketGapDetection?.[0] || null;
  const engineConfidence = result.analyticsEngine?.confidence || null;
  const risks = result.analyticsEngine?.riskAnalysis?.risks?.length
    ? result.analyticsEngine.riskAnalysis.risks
    : result.strategicIntelligence?.riskAnalysis || [];

  return {
    layer: "TezTap Opportunity Discovery Engine",
    version: "1.0",
    generatedAt: new Date().toISOString(),
    commercialQuestionMap: {
      whatBusinessShouldIOpen: buildBusinessDecision({ result, bestDistrict }),
      whereShouldIOpenIt: buildLocationDecision({ result, bestDistrict }),
      whyIsItGoodOpportunity: buildWhyDecision({ result, bestDistrict, strongestGap }),
      whatAreTheRisks: buildRiskDecision({ risks, result }),
      whatBudgetIsRequired: buildBudgetDecision({ result }),
      whatIsMissingInMarket: buildGapDecision({ strongestGap, result }),
      probabilityOfSuccess: buildProbabilityDecision({ result })
    },
    recommendedDistricts: buildRecommendedDistricts(result),
    districtOpportunityDetection: buildDistrictOpportunityDetection(result),
    marketGaps: result.analyticsEngine?.marketGaps?.gaps || result.strategicIntelligence?.marketGapDetection || [],
    requiredBudget: {
      inputBudget: result.budgetPlan?.inputBudget || 0,
      minimumViableBudget: result.budgetPlan?.minimumViableBudget || 0,
      budgetShortfall: result.budgetPlan?.budgetShortfall || 0,
      budgetRealismScore: result.budgetPlan?.budgetRealismScore || 0,
      budgetRiskLevel: result.budgetPlan?.budgetRiskLevel || "Unknown"
    },
    confidence: {
      score: engineConfidence?.score ?? result.probability?.assumptions?.evidenceScore ?? 0,
      label: engineConfidence?.label || "Validation required",
      explanation: engineConfidence?.explanation || "Confidence is derived from the scoring engine evidence quality."
    },
    noHallucinationRule: "Every field is derived from the current analysis result; absent evidence must remain absent."
  };
}

function buildBusinessDecision({ result, bestDistrict }) {
  return {
    answer: result.profile?.title || result.input?.businessType || null,
    recommendationType: "analyzed_category",
    reason: `${result.profile?.title || "The selected category"} is the loaded category. Opportunity score is ${result.opportunityScore?.score || 0}/100 and success probability is ${result.probability?.successProbability || 0}%.`,
    bestDistrict: bestDistrict?.district || bestDistrict?.name || result.recommendation?.bestArea || null,
    caveat: "To compare multiple business ideas, run analysis for each category and compare their opportunity discovery packages."
  };
}

function buildLocationDecision({ result, bestDistrict }) {
  if (!bestDistrict) {
    return {
      answer: null,
      reason: "No ranked district was returned by the district scoring engine."
    };
  }

  return {
    answer: bestDistrict.district || bestDistrict.name,
    rank: bestDistrict.rank || 1,
    opportunityScore: bestDistrict.opportunityScore ?? bestDistrict.score ?? 0,
    reason: bestDistrict.reason || `${bestDistrict.district || bestDistrict.name} combines ${bestDistrict.underservedScore ?? 0}/100 underserved demand, ${bestDistrict.footTraffic ?? 0}/100 traffic, and ${bestDistrict.nearbyCompetitors ?? bestDistrict.competitorCountNearby ?? 0} nearby competitors.`
  };
}

function buildWhyDecision({ result, bestDistrict, strongestGap }) {
  return {
    opportunityScore: result.opportunityScore?.score || 0,
    successProbability: result.probability?.successProbability || 0,
    saturation: result.opportunityScore?.saturation || result.saturationData?.overall || null,
    evidence: [
      bestDistrict
        ? `${bestDistrict.district || bestDistrict.name} has opportunity score ${bestDistrict.opportunityScore ?? bestDistrict.score ?? 0}/100.`
        : null,
      strongestGap
        ? `${strongestGap.district || strongestGap.area} shows market gap priority ${strongestGap.priorityScore ?? strongestGap.underservedScore ?? 0}.`
        : null,
      `${result.market?.competitorCount || 0} competitors and ${result.stats?.sampleCount || 0} verified price samples support the current evidence base.`
    ].filter(Boolean)
  };
}

function buildRiskDecision({ risks, result }) {
  return {
    riskScore: result.analyticsEngine?.riskAnalysis?.riskScore ?? null,
    level: result.analyticsEngine?.riskAnalysis?.level || result.budgetPlan?.budgetRiskLevel || "Unknown",
    factors: (risks || []).slice(0, 5).map((risk) => ({
      label: risk.label || risk.title || "Risk",
      level: risk.level || risk.severity || "Unknown",
      evidence: risk.evidence || risk.description || "Risk is derived from current scoring outputs."
    }))
  };
}

function buildBudgetDecision({ result }) {
  return {
    requiredMinimumBudget: result.budgetPlan?.minimumViableBudget || 0,
    userBudget: result.budgetPlan?.inputBudget || 0,
    budgetShortfall: result.budgetPlan?.budgetShortfall || 0,
    runwayMonths: result.budgetPlan?.runwayMonths || 0,
    breakEvenTransactions: result.budgetPlan?.breakEvenTransactions || null,
    budgetRealismScore: result.budgetPlan?.budgetRealismScore || 0,
    decision: result.budgetPlan?.isBelowMinimum
      ? "Not viable at current budget without raising capital or reducing scope."
      : "Budget is sufficient for a controlled launch test."
  };
}

function buildGapDecision({ strongestGap, result }) {
  if (!strongestGap) {
    return {
      answer: null,
      reason: "No confirmed market gap was returned by the current district metrics."
    };
  }

  return {
    answer: strongestGap.district || strongestGap.area,
    priorityScore: strongestGap.priorityScore ?? strongestGap.underservedScore ?? 0,
    underservedScore: strongestGap.underservedScore ?? 0,
    directCompetitors: strongestGap.directCompetitors ?? 0,
    nearbyCompetitors: strongestGap.nearbyCompetitors ?? 0,
    reason: strongestGap.explanation || `${strongestGap.district || strongestGap.area} is the strongest visible gap for ${result.profile?.title || result.input?.businessType}.`
  };
}

function buildProbabilityDecision({ result }) {
  return {
    successProbability: result.probability?.successProbability || 0,
    profitabilityProbability: result.probability?.profitabilityProbability || 0,
    survivalProbability: result.probability?.survivalProbability || 0,
    level: result.probability?.level || "Unknown",
    explanation: result.probability?.explanation || "Probability is calculated by the scoring engine from current analytics."
  };
}

function buildRecommendedDistricts(result) {
  return (result.analyticsEngine?.districtRankings || result.districtMetrics || [])
    .slice(0, 5)
    .map((district) => ({
      district: district.district || district.name,
      rank: district.rank || null,
      opportunityScore: district.opportunityScore ?? district.score ?? 0,
      recommendation: district.recommendation || null,
      explanation: district.explanation || district.reason || null
    }));
}

function buildDistrictOpportunityDetection(result) {
  const districts = result.districtMetrics?.length ? result.districtMetrics : result.opportunityAreas || [];
  const cityCategories = buildCityCategoryEvidence(result);

  return districts.map((district) => {
    const districtName = district.district || district.name;
    const directCompetitors = (result.competitors || []).filter((competitor) => competitor.area === districtName);
    const districtCategories = buildDistrictCategoryEvidence({ competitors: directCompetitors, prices: result.prices || [] });
    const missingServices = detectMissingServices({ cityCategories, districtCategories });
    const underservedBusinessCategories = detectUnderservedBusinessCategories({
      result,
      district,
      directCompetitors,
      missingServices
    });
    const pricingGaps = detectPricingGaps({ result, districtName, districtCategories, cityCategories });
    const weakCompetition = detectWeakCompetition({ district, directCompetitors });
    const marketOpportunities = buildMarketOpportunities({
      result,
      district,
      missingServices,
      underservedBusinessCategories,
      pricingGaps,
      weakCompetition
    });

    return {
      district: districtName,
      opportunityScore: district.opportunityScore ?? district.score ?? 0,
      requiredBudget: {
        minimumViableBudget: result.budgetPlan?.minimumViableBudget || 0,
        currentBudget: result.budgetPlan?.inputBudget || 0,
        budgetShortfall: result.budgetPlan?.budgetShortfall || 0,
        budgetRiskLevel: result.budgetPlan?.budgetRiskLevel || "Unknown",
        budgetRealismScore: result.budgetPlan?.budgetRealismScore || 0
      },
      underservedBusinessCategories,
      missingServices,
      pricingGaps,
      weakCompetitionAreas: weakCompetition ? [weakCompetition] : [],
      marketOpportunities,
      riskFactors: buildDistrictRiskFactors({ result, district, directCompetitors }),
      answerSummary: buildDistrictAnswerSummary({
        result,
        district,
        missingServices,
        underservedBusinessCategories,
        pricingGaps,
        weakCompetition
      }),
      confidenceScore: calculateDistrictDetectionConfidence({
        result,
        directCompetitors,
        missingServices,
        pricingGaps
      }),
      linkedAnalytics: {
        directCompetitorCount: directCompetitors.length,
        nearbyCompetitors: district.nearbyCompetitors ?? district.competitorCountNearby ?? 0,
        underservedScore: district.underservedScore ?? 0,
        footTraffic: district.footTraffic ?? 0,
        saturation: district.saturation || "unknown",
        citywidePriceSampleCount: result.stats?.sampleCount || 0,
        districtPriceSampleCount: districtCategories.totalPriceSamples,
        reviewSentiment: calculateDistrictReviewSentiment(directCompetitors)
      }
    };
  });
}

function buildCityCategoryEvidence(result) {
  const categories = new Map();

  for (const record of result.prices || []) {
    const category = record.category || record.productName || "Uncategorized";
    const current = categories.get(category) || {
      category,
      sampleCount: 0,
      totalPrice: 0,
      minPrice: Number.POSITIVE_INFINITY,
      maxPrice: 0,
      businesses: new Set()
    };

    current.sampleCount += 1;
    current.totalPrice += Number(record.price) || 0;
    current.minPrice = Math.min(current.minPrice, Number(record.price) || 0);
    current.maxPrice = Math.max(current.maxPrice, Number(record.price) || 0);
    current.businesses.add(record.businessName);
    categories.set(category, current);
  }

  return Array.from(categories.values()).map((item) => ({
    category: item.category,
    sampleCount: item.sampleCount,
    averagePrice: item.sampleCount ? Math.round(item.totalPrice / item.sampleCount) : 0,
    minPrice: Number.isFinite(item.minPrice) ? item.minPrice : 0,
    maxPrice: item.maxPrice,
    businessCount: item.businesses.size
  }));
}

function buildDistrictCategoryEvidence({ competitors, prices }) {
  const competitorNames = new Set(competitors.map((competitor) => String(competitor.name || "").toLowerCase()));
  const districtPrices = (prices || []).filter((record) => competitorNames.has(String(record.businessName || "").toLowerCase()));
  const categories = buildCategoryStats(districtPrices);

  return {
    categories,
    totalPriceSamples: districtPrices.length
  };
}

function buildCategoryStats(prices) {
  const categories = new Map();

  for (const record of prices || []) {
    const category = record.category || record.productName || "Uncategorized";
    const current = categories.get(category) || {
      category,
      sampleCount: 0,
      totalPrice: 0
    };

    current.sampleCount += 1;
    current.totalPrice += Number(record.price) || 0;
    categories.set(category, current);
  }

  return Array.from(categories.values()).map((item) => ({
    category: item.category,
    sampleCount: item.sampleCount,
    averagePrice: item.sampleCount ? Math.round(item.totalPrice / item.sampleCount) : 0
  }));
}

function detectMissingServices({ cityCategories, districtCategories }) {
  const districtCategorySet = new Set((districtCategories.categories || []).map((item) => item.category));

  return cityCategories
    .filter((category) => category.sampleCount >= 2 && !districtCategorySet.has(category.category))
    .slice(0, 6)
    .map((category) => ({
      service: category.category,
      evidence: `${category.sampleCount} verified citywide price samples exist, but this district has no matching verified samples.`,
      cityAveragePrice: category.averagePrice,
      confidence: category.sampleCount >= 5 ? "medium" : "early signal"
    }));
}

function detectUnderservedBusinessCategories({ result, district, directCompetitors, missingServices }) {
  const categories = [];
  const direct = directCompetitors.length;
  const nearby = Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0) || 0;
  const underserved = Number(district.underservedScore) || 0;

  if (direct === 0 && nearby <= 1 && underserved >= 60) {
    categories.push({
      category: result.profile?.title || result.input?.businessType || "Selected business category",
      signal: "underserved district category",
      evidence: `No direct competitors, ${nearby} nearby competitors, and underserved score ${underserved}/100.`
    });
  } else if (direct <= 1 && underserved >= 65) {
    categories.push({
      category: result.profile?.title || result.input?.businessType || "Selected business category",
      signal: "low-density category opportunity",
      evidence: `${direct} direct competitor(s), ${nearby} nearby competitor(s), and underserved score ${underserved}/100.`
    });
  }

  for (const service of missingServices.slice(0, 3)) {
    categories.push({
      category: service.service,
      signal: "missing verified service evidence",
      evidence: service.evidence
    });
  }

  return categories;
}

function detectPricingGaps({ result, districtCategories, cityCategories }) {
  const gaps = [];
  const cityAverage = result.stats?.avgPrice || 0;

  if (!districtCategories.totalPriceSamples && cityAverage) {
    gaps.push({
      type: "district price evidence gap",
      evidence: `Citywide average price is ${cityAverage} KZT across ${result.stats?.sampleCount || 0} samples, but this district has no verified district-level price samples.`,
      action: "Collect competitor menus, price lists, or receipts before setting the launch price."
    });
  }

  for (const cityCategory of cityCategories.slice(0, 6)) {
    const districtCategory = districtCategories.categories.find((item) => item.category === cityCategory.category);

    if (!districtCategory || !districtCategory.averagePrice || !cityCategory.averagePrice) {
      continue;
    }

    const delta = districtCategory.averagePrice - cityCategory.averagePrice;
    const deltaPercent = Math.round((delta / Math.max(1, cityCategory.averagePrice)) * 100);

    if (Math.abs(deltaPercent) >= 15) {
      gaps.push({
        type: "category price corridor gap",
        category: cityCategory.category,
        districtAveragePrice: districtCategory.averagePrice,
        cityAveragePrice: cityCategory.averagePrice,
        deltaPercent,
        evidence: `${cityCategory.category} district average is ${districtCategory.averagePrice} KZT versus ${cityCategory.averagePrice} KZT city average.`
      });
    }
  }

  return gaps.slice(0, 5);
}

function detectWeakCompetition({ district, directCompetitors }) {
  const direct = directCompetitors.length;
  const nearby = Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0) || 0;
  const weakRated = directCompetitors.filter((competitor) => Number(competitor.rating) > 0 && Number(competitor.rating) < 4).length;
  const underserved = Number(district.underservedScore) || 0;

  if (direct <= 1 && nearby <= 2) {
    return {
      signal: "low competitor density",
      evidence: `${direct} direct competitor(s), ${nearby} nearby competitor(s), and underserved score ${underserved}/100.`,
      weakRatedCompetitors: weakRated
    };
  }

  if (weakRated && underserved >= 55) {
    return {
      signal: "service-quality opening",
      evidence: `${weakRated} direct competitor(s) have ratings below 4.0 while underserved score is ${underserved}/100.`,
      weakRatedCompetitors: weakRated
    };
  }

  return null;
}

function buildMarketOpportunities({ result, district, missingServices, underservedBusinessCategories, pricingGaps, weakCompetition }) {
  const opportunities = [];
  const districtName = district.district || district.name;

  if (underservedBusinessCategories[0]) {
    opportunities.push({
      title: `${underservedBusinessCategories[0].category} opportunity`,
      why: underservedBusinessCategories[0].evidence,
      score: district.opportunityScore ?? district.score ?? 0
    });
  }

  if (missingServices[0]) {
    opportunities.push({
      title: `${missingServices[0].service} service gap`,
      why: missingServices[0].evidence,
      score: Math.max(1, Math.min(100, Number(district.underservedScore || 0)))
    });
  }

  if (weakCompetition) {
    opportunities.push({
      title: `Weak competition in ${districtName}`,
      why: weakCompetition.evidence,
      score: Math.max(1, Math.min(100, 100 - Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0) * 18))
    });
  }

  if (pricingGaps[0]) {
    opportunities.push({
      title: "Pricing intelligence gap",
      why: pricingGaps[0].evidence,
      score: result.stats?.sampleCount >= 4 ? 58 : 38
    });
  }

  return opportunities.slice(0, 5);
}

function buildDistrictRiskFactors({ result, district, directCompetitors }) {
  const risks = [];
  const nearby = Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0) || 0;

  if (district.saturation === "high" || nearby >= 4) {
    risks.push({
      label: "Saturation risk",
      level: "High",
      evidence: `${nearby} nearby competitors and ${district.saturation || "unknown"} saturation.`
    });
  }

  if (result.budgetPlan?.isBelowMinimum) {
    risks.push({
      label: "Capital risk",
      level: result.budgetPlan.budgetRiskLevel,
      evidence: `Budget shortfall is ${result.budgetPlan.budgetShortfall} KZT versus minimum viable budget ${result.budgetPlan.minimumViableBudget} KZT.`
    });
  }

  if (!directCompetitors.some((competitor) => (competitor.priceSamples || []).length)) {
    risks.push({
      label: "Price evidence risk",
      level: "Medium",
      evidence: "No direct district competitor has verified price samples in the current analysis."
    });
  }

  return risks;
}

function buildDistrictAnswerSummary({ result, district, missingServices, underservedBusinessCategories, pricingGaps, weakCompetition }) {
  const districtName = district.district || district.name;
  const parts = [];

  if (underservedBusinessCategories[0]) {
    parts.push(`${underservedBusinessCategories[0].category} is underserved because ${underservedBusinessCategories[0].evidence}`);
  }

  if (missingServices[0]) {
    parts.push(`${missingServices[0].service} is missing from verified district evidence because ${missingServices[0].evidence}`);
  }

  if (weakCompetition) {
    parts.push(`Competition is comparatively weak: ${weakCompetition.evidence}`);
  }

  if (pricingGaps[0]) {
    parts.push(`Pricing gap: ${pricingGaps[0].evidence}`);
  }

  if (!parts.length) {
    parts.push(`No strong missing-category signal is confirmed for ${districtName}; use the opportunity score ${district.opportunityScore ?? district.score ?? 0}/100 and saturation ${district.saturation || "unknown"} as the current decision basis.`);
  }

  return {
    headline: `${districtName}: ${district.opportunityScore ?? district.score ?? 0}/100 opportunity score`,
    answer: parts.join(" "),
    budget: `Minimum viable budget is ${result.budgetPlan?.minimumViableBudget || 0} KZT; current budget risk is ${result.budgetPlan?.budgetRiskLevel || "Unknown"}.`
  };
}

function calculateDistrictDetectionConfidence({ result, directCompetitors, missingServices, pricingGaps }) {
  const competitorScore = Math.min(100, directCompetitors.length * 28 + Number(result.market?.competitorCount || 0) * 5);
  const priceScore = Math.min(100, Number(result.stats?.sampleCount || 0) * 8);
  const gapScore = missingServices.length || pricingGaps.length ? 62 : 42;

  return Math.max(1, Math.min(100, Math.round(competitorScore * 0.38 + priceScore * 0.38 + gapScore * 0.24)));
}

function calculateDistrictReviewSentiment(competitors) {
  const rated = competitors.filter((competitor) => Number(competitor.rating) > 0);

  if (!rated.length) {
    return "rating evidence unavailable";
  }

  const average = rated.reduce((sum, competitor) => sum + Number(competitor.rating), 0) / rated.length;

  if (average >= 4.5) {
    return "positive";
  }

  if (average >= 4) {
    return "mixed positive";
  }

  return "weak service signal";
}

module.exports = {
  buildOpportunityDiscovery
};
