function buildMarketGapEngine({ result }) {
  const districtRows = result.districtMetrics?.length ? result.districtMetrics : result.opportunityAreas || [];
  const bestDistrict = districtRows[0] || null;
  const competitors = result.competitors || [];
  const prices = result.prices || [];
  const categoryStats = result.businessCategoryStats || [];
  const missingCategories = detectMissingCategories({ result, categoryStats, prices });
  const underservedPricingSegments = detectUnderservedPricingSegments({ result, prices });
  const weakMarketCoverage = detectWeakMarketCoverage({ result, districtRows, competitors });
  const unmetDemandIndicators = detectUnmetDemandIndicators({ result, districtRows });
  const boi = buildBoiScore({
    result,
    bestDistrict,
    competitors,
    missingCategories,
    underservedPricingSegments,
    weakMarketCoverage,
    unmetDemandIndicators
  });
  const strategicAdvisor = buildStrategicAdvisor({
    result,
    boi,
    missingCategories,
    underservedPricingSegments,
    weakMarketCoverage,
    unmetDemandIndicators
  });

  return {
    engine: "TezTap Market Gap Engine",
    version: "2.0",
    generatedAt: new Date().toISOString(),
    summary: buildGapSummary({
      result,
      boi,
      bestDistrict,
      missingCategories,
      underservedPricingSegments,
      weakMarketCoverage,
      unmetDemandIndicators
    }),
    boi,
    detections: {
      missingCategories,
      underservedPricingSegments,
      weakMarketCoverage,
      unmetDemandIndicators
    },
    headlineSignals: buildHeadlineSignals({
      result,
      bestDistrict,
      missingCategories,
      underservedPricingSegments,
      weakMarketCoverage,
      unmetDemandIndicators
    }),
    opportunityTheses: buildOpportunityTheses({
      result,
      boi,
      missingCategories,
      underservedPricingSegments,
      weakMarketCoverage,
      unmetDemandIndicators
    }),
    visualization: buildVisualizationModel({
      boi,
      missingCategories,
      underservedPricingSegments,
      weakMarketCoverage,
      unmetDemandIndicators
    }),
    strategicAdvisor,
    guardrail: "All detections and BOI drivers are calculated from current district metrics, competitors, pricing evidence, budget plan, sentiment, saturation, and growth signals."
  };
}

function detectMissingCategories({ result, categoryStats, prices }) {
  const signals = [];
  const byCategory = new Map();

  for (const price of prices) {
    const category = price.category || price.productName || "Uncategorized";
    const current = byCategory.get(category) || {
      category,
      priceSamples: 0,
      businesses: new Set(),
      totalPrice: 0
    };

    current.priceSamples += 1;
    current.businesses.add(price.businessName);
    current.totalPrice += Number(price.price) || 0;
    byCategory.set(category, current);
  }

  for (const category of categoryStats) {
    const competitorCount = Number(category.competitorCount || 0);
    const priceSamples = Number(category.priceSamples || 0);

    if (competitorCount <= 1 && priceSamples >= 1) {
      signals.push({
        type: "thin_category_coverage",
        category: category.category,
        score: clampScore(76 - competitorCount * 16 + Math.min(16, priceSamples * 2)),
        evidence: `${category.category} has ${competitorCount} detected competitor(s), ${priceSamples} price sample(s), and average price ${category.averagePrice || "n/a"} KZT.`,
        whyItMatters: "A category with pricing evidence but low competitor count can indicate market coverage is thin, not guaranteed demand."
      });
    }
  }

  for (const category of byCategory.values()) {
    const exists = categoryStats.some((item) => item.category === category.category);

    if (!exists && category.priceSamples >= 2) {
      signals.push({
        type: "priced_but_unclassified_category",
        category: category.category,
        score: clampScore(54 + Math.min(24, category.priceSamples * 3)),
        evidence: `${category.category} appears in ${category.priceSamples} verified price sample(s), but it is not represented in detected category competitor stats.`,
        whyItMatters: "The market has visible pricing evidence without enough classified supply coverage."
      });
    }
  }

  if (!signals.length && result.opportunityDiscovery?.districtOpportunityDetection?.length) {
    for (const district of result.opportunityDiscovery.districtOpportunityDetection.slice(0, 4)) {
      for (const service of district.missingServices || []) {
        signals.push({
          type: "district_missing_service",
          district: district.district,
          category: service.service,
          score: service.confidence === "medium" ? 68 : 52,
          evidence: service.evidence,
          whyItMatters: "A service visible elsewhere in the city but absent in a district can indicate localized supply gaps."
        });
      }
    }
  }

  return dedupeByEvidence(signals).slice(0, 8);
}

function detectUnderservedPricingSegments({ result, prices }) {
  const stats = result.stats || {};
  const sampleCount = Number(stats.sampleCount || 0);
  const average = Number(stats.avgPrice || 0);
  const min = Number(stats.minPrice || 0);
  const max = Number(stats.maxPrice || 0);
  const signals = [];

  if (!sampleCount) {
    signals.push({
      type: "missing_price_evidence",
      segment: "price validation",
      score: 34,
      evidence: "No verified product-level price samples are available for this analysis.",
      whyItMatters: "Without price evidence, margin, positioning, and break-even assumptions are fragile."
    });
    return signals;
  }

  const affordableCount = prices.filter((price) => Number(price.price) > 0 && Number(price.price) <= average * 0.85).length;
  const premiumCount = prices.filter((price) => Number(price.price) >= average * 1.2).length;
  const spreadRatio = average ? round((max - min) / average, 2) : 0;

  if (sampleCount < 6) {
    signals.push({
      type: "thin_price_coverage",
      segment: "pricing evidence",
      score: 48,
      evidence: `${sampleCount} verified price sample(s) are available; stronger price coverage normally needs more comparable records.`,
      whyItMatters: "Thin price coverage makes pricing strategy less reliable."
    });
  }

  if (average && affordableCount <= 1 && sampleCount >= 4) {
    signals.push({
      type: "affordable_segment_gap",
      segment: "affordable entry price",
      score: 64,
      evidence: `${affordableCount} sample(s) are priced at or below 85% of the observed ${average} KZT average.`,
      whyItMatters: "Few lower-price comparables may reveal room for a value-positioned offer, but only if unit economics still work."
    });
  }

  if (average && premiumCount <= 1 && sampleCount >= 4) {
    signals.push({
      type: "premium_segment_gap",
      segment: "premium price tier",
      score: 58,
      evidence: `${premiumCount} sample(s) are priced at or above 120% of the observed ${average} KZT average.`,
      whyItMatters: "Few premium comparables can mean a premium gap or weak willingness to pay; validation is required."
    });
  }

  if (spreadRatio > 1.2) {
    signals.push({
      type: "unstable_price_corridor",
      segment: "price corridor",
      score: 42,
      evidence: `Observed price spread is ${max - min} KZT, or ${spreadRatio}x the average price.`,
      whyItMatters: "Wide dispersion makes price positioning more sensitive and increases margin risk."
    });
  }

  return signals.slice(0, 6);
}

function detectWeakMarketCoverage({ districtRows, competitors }) {
  return districtRows
    .map((district) => {
      const districtName = district.district || district.name;
      const directCompetitors = competitors.filter((competitor) => competitor.area === districtName);
      const nearby = Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0) || 0;
      const direct = directCompetitors.length;
      const weakRated = directCompetitors.filter((competitor) => Number(competitor.rating) > 0 && Number(competitor.rating) < 4).length;
      const underserved = Number(district.underservedScore || 0);
      const score = clampScore(underserved * 0.48 + Math.max(0, 100 - direct * 24 - nearby * 12) * 0.42 + Math.min(18, weakRated * 9));

      return {
        district: districtName,
        score,
        directCompetitors: direct,
        nearbyCompetitors: nearby,
        weakRatedCompetitors: weakRated,
        evidence: `${districtName} has ${direct} direct competitor(s), ${nearby} nearby competitor(s), ${weakRated} weak-rated competitor(s), and underservedScore ${underserved}/100.`,
        whyItMatters: "Weak coverage is commercially useful only when demand signals and budget realism are also strong."
      };
    })
    .filter((item) => item.score >= 52)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);
}

function detectUnmetDemandIndicators({ districtRows }) {
  return districtRows
    .map((district) => {
      const districtName = district.district || district.name;
      const footTraffic = Number(district.footTraffic || 0);
      const underserved = Number(district.underservedScore || 0);
      const opportunity = Number(district.opportunityScore ?? district.score ?? 0);
      const nearby = Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0);
      const score = clampScore(footTraffic * 0.38 + underserved * 0.4 + opportunity * 0.16 + Math.max(0, 100 - nearby * 18) * 0.06);

      return {
        district: districtName,
        score,
        footTraffic,
        underservedScore: underserved,
        opportunityScore: opportunity,
        evidence: `${districtName} has footTraffic ${footTraffic}/100, underservedScore ${underserved}/100, opportunityScore ${opportunity}/100, and ${nearby} nearby competitor(s).`,
        whyItMatters: "Unmet demand indicators point to where customer access and supply gaps may align."
      };
    })
    .filter((item) => item.score >= 58)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);
}

function buildBoiScore({ result, bestDistrict, competitors, missingCategories, underservedPricingSegments, weakMarketCoverage, unmetDemandIndicators }) {
  const competitorCount = Number(result.market?.competitorCount || competitors.length || 0);
  const nearby = Number(bestDistrict?.nearbyCompetitors ?? bestDistrict?.competitorCountNearby ?? 0);
  const competition = clampScore(100 - Math.min(92, competitorCount * 4.8 + nearby * 10));
  const demand = clampScore((Number(bestDistrict?.underservedScore) || 0) * 0.52 + (Number(bestDistrict?.footTraffic) || 0) * 0.36 + (Number(bestDistrict?.opportunityScore ?? bestDistrict?.score) || 0) * 0.12);
  const marketGaps = strongestScore([...missingCategories, ...weakMarketCoverage, ...unmetDemandIndicators]);
  const accessibility = clampScore((Number(bestDistrict?.footTraffic) || 0) * 0.56 + Math.max(0, 100 - Number(bestDistrict?.rentIndex || 0)) * 0.24 + Math.min(20, (bestDistrict?.anchors || []).length * 5));
  const sentiment = buildSentimentScore(competitors);
  const saturation = clampScore(100 - saturationPressure(bestDistrict, result));
  const growthTrends = clampScore(result.analyticsEngine?.growthPotential?.topDistrict?.growthScore ?? unmetDemandIndicators[0]?.score ?? demand);
  const score = clampScore(
    competition * 0.17 +
      demand * 0.2 +
      marketGaps * 0.17 +
      accessibility * 0.13 +
      sentiment * 0.1 +
      saturation * 0.13 +
      growthTrends * 0.1
  );

  return {
    name: "Business Opportunity Index",
    abbreviation: "BOI",
    score,
    label: score >= 76 ? "Strong commercial opening" : score >= 56 ? "Promising but needs validation" : "Weak or risky opening",
    drivers: {
      competition,
      demand,
      marketGaps,
      accessibility,
      sentiment,
      saturation,
      growthTrends
    },
    weights: {
      competition: 0.17,
      demand: 0.2,
      marketGaps: 0.17,
      accessibility: 0.13,
      sentiment: 0.1,
      saturation: 0.13,
      growthTrends: 0.1
    },
    explanation: `BOI Score is ${score}/100 from competition ${competition}/100, demand ${demand}/100, market gaps ${marketGaps}/100, accessibility ${accessibility}/100, sentiment ${sentiment}/100, saturation relief ${saturation}/100, and growth trends ${growthTrends}/100.`,
    decisionRule: score >= 76
      ? "Prioritize validation and site search."
      : score >= 56
        ? "Proceed only with field validation and risk controls."
        : "Challenge the current plan and evaluate lower-risk pivots before committing capital."
  };
}

function buildStrategicAdvisor({ result, boi, missingCategories, underservedPricingSegments, weakMarketCoverage, unmetDemandIndicators }) {
  const alternatives = result.proprietaryScoring?.budgetIntelligence?.alternativeRecommendations || [];
  const currentBudgetRisk = result.budgetPlan?.budgetRiskLevel || "Unknown";
  const currentOpportunity = result.opportunityScore?.score || 0;
  const challengeReasons = [];

  if (result.budgetPlan?.isBelowMinimum) {
    challengeReasons.push(`Budget is ${result.budgetPlan.budgetShortfall} KZT below the minimum viable ${result.budgetPlan.minimumViableBudget} KZT threshold.`);
  }

  if (boi.score < 56) {
    challengeReasons.push(`BOI is ${boi.score}/100, which indicates the opening is not yet commercially strong.`);
  }

  if (String(result.opportunityScore?.saturation || "").toLowerCase().includes("high")) {
    challengeReasons.push(`Market saturation is ${result.opportunityScore.saturation}.`);
  }

  if (result.stats?.sampleCount < 4) {
    challengeReasons.push(`Only ${result.stats?.sampleCount || 0} price sample(s) support pricing assumptions.`);
  }

  return {
    stance: challengeReasons.length ? "challenge_or_pivot" : "support_with_validation",
    challenge: challengeReasons.length
      ? `The current idea needs pressure-testing: ${challengeReasons.join(" ")}`
      : `The current idea is defensible, but should still be validated with district-level pricing, competitor quality, and demand checks.`,
    risksToExplain: [
      result.budgetPlan?.isBelowMinimum ? "low-budget risk" : null,
      result.opportunityScore?.saturation ? "saturation risk" : null,
      result.market?.competitorCount ? "competition risk" : null,
      result.stats?.sampleCount < 8 ? "pricing evidence risk" : null
    ].filter(Boolean),
    pivots: buildPivots({ result, alternatives, currentBudgetRisk, currentOpportunity }),
    alternatives: alternatives.slice(0, 4),
    comparison: buildPlanComparison({ result, alternatives, boi }),
    marketGapPriorities: [
      ...missingCategories,
      ...underservedPricingSegments,
      ...weakMarketCoverage,
      ...unmetDemandIndicators
    ].sort((left, right) => Number(right.score || 0) - Number(left.score || 0)).slice(0, 6)
  };
}

function buildGapSummary({ result, boi, bestDistrict, missingCategories, underservedPricingSegments, weakMarketCoverage, unmetDemandIndicators }) {
  const district = bestDistrict?.district || bestDistrict?.name || result.recommendation?.bestArea || "the leading district";
  const strongestGap = [...missingCategories, ...underservedPricingSegments, ...weakMarketCoverage, ...unmetDemandIndicators]
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))[0];
  const profile = result.profile?.title || "selected business";

  return {
    title: `BOI Score: ${boi.score}/100`,
    verdict: boi.label,
    district,
    strongestGap: strongestGap
      ? `${strongestGap.category || strongestGap.segment || strongestGap.district || "Market gap"}: ${strongestGap.score}/100`
      : "No strong gap confirmed",
    plainEnglish: strongestGap
      ? `${profile} has a ${boi.label.toLowerCase()} in ${district}; the clearest gap is ${strongestGap.category || strongestGap.segment || strongestGap.district || "market coverage"} with ${strongestGap.score}/100 signal strength.`
      : `${profile} does not show a strong enough market gap yet; BOI is ${boi.score}/100 and should be validated before capital commitment.`
  };
}

function buildHeadlineSignals({ result, bestDistrict, missingCategories, underservedPricingSegments, weakMarketCoverage, unmetDemandIndicators }) {
  const signals = [];
  const profile = String(result.profile?.title || result.input?.businessType || "business").toLowerCase();
  const district = bestDistrict?.district || bestDistrict?.name || result.recommendation?.bestArea || "this district";
  const affordableGap = underservedPricingSegments.find((item) => item.type === "affordable_segment_gap");
  const weakCoverage = weakMarketCoverage.find((item) => item.district === district) || weakMarketCoverage[0];

  if (affordableGap && weakCoverage) {
    signals.push({
      type: "affordable_gap",
      statement: `No strong affordable ${profile} coverage detected within ${district}.`,
      evidence: `${affordableGap.evidence} ${weakCoverage.evidence}`,
      score: clampScore((affordableGap.score + weakCoverage.score) / 2)
    });
  }

  for (const item of missingCategories.slice(0, 2)) {
    signals.push({
      type: "missing_category",
      statement: `${item.category} appears under-covered in ${item.district || district}.`,
      evidence: item.evidence,
      score: item.score
    });
  }

  for (const item of unmetDemandIndicators.slice(0, 2)) {
    signals.push({
      type: "unmet_demand",
      statement: `${item.district} shows unmet-demand pressure with ${item.score}/100 signal strength.`,
      evidence: item.evidence,
      score: item.score
    });
  }

  if (!signals.length) {
    signals.push({
      type: "no_confirmed_gap",
      statement: "No major market gap is confirmed by the current evidence.",
      evidence: "The engine needs stronger pricing, competitor, category, or district imbalance signals before claiming whitespace.",
      score: 0
    });
  }

  return signals.slice(0, 5);
}

function buildOpportunityTheses({ result, boi, missingCategories, underservedPricingSegments, weakMarketCoverage, unmetDemandIndicators }) {
  const priorities = [
    ...missingCategories,
    ...underservedPricingSegments,
    ...weakMarketCoverage,
    ...unmetDemandIndicators
  ].sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
  const budgetRisk = result.budgetPlan?.budgetRiskLevel || "unknown";

  return priorities.slice(0, 5).map((item, index) => ({
    rank: index + 1,
    thesis: buildThesisTitle(item, result),
    score: item.score,
    evidence: item.evidence,
    riskCheck: budgetRisk === "Controlled"
      ? "Budget does not appear to be the main constraint, but lease and demand validation still matter."
      : `Budget risk is ${budgetRisk}; treat this opportunity as a smaller-format or phased validation candidate.`,
    recommendedMove: item.type === "affordable_segment_gap"
      ? "Test a value-positioned offer with strict unit economics."
      : item.type === "premium_segment_gap"
        ? "Validate willingness to pay before building a premium format."
        : boi.score >= 56
          ? "Run field validation in the strongest district before signing fixed costs."
          : "Do not launch at full scope; compare pivots and lower-capital alternatives first."
  }));
}

function buildThesisTitle(item, result) {
  if (item.category) {
    return `${item.category} supply gap`;
  }

  if (item.segment) {
    return `${item.segment} pricing gap`;
  }

  if (item.district) {
    return `${item.district} coverage gap for ${result.profile?.title || "the selected category"}`;
  }

  return "Market gap thesis";
}

function buildVisualizationModel({ boi, missingCategories, underservedPricingSegments, weakMarketCoverage, unmetDemandIndicators }) {
  return {
    boiGauge: {
      score: boi.score,
      label: boi.label,
      segments: [
        { label: "Weak", min: 0, max: 55 },
        { label: "Promising", min: 56, max: 75 },
        { label: "Strong", min: 76, max: 100 }
      ]
    },
    driverBars: Object.entries(boi.drivers).map(([driver, score]) => ({
      driver,
      score,
      weight: boi.weights[driver] || 0
    })),
    detectionBars: [
      { label: "Missing categories", score: strongestScore(missingCategories) },
      { label: "Pricing segments", score: strongestScore(underservedPricingSegments) },
      { label: "Coverage gaps", score: strongestScore(weakMarketCoverage) },
      { label: "Unmet demand", score: strongestScore(unmetDemandIndicators) }
    ]
  };
}

function buildPlanComparison({ result, alternatives, boi }) {
  const currentTitle = result.profile?.title || result.input?.businessType || "current plan";
  const currentRisk = result.budgetPlan?.budgetRiskLevel || "Unknown";
  const current = {
    title: currentTitle,
    boiScore: boi.score,
    successProbability: result.probability?.successProbability || 0,
    budgetRisk: currentRisk,
    startupRisk: riskFromScores({ boiScore: boi.score, budgetRisk: currentRisk }),
    read: `${currentTitle} has BOI ${boi.score}/100, success probability ${result.probability?.successProbability || 0}%, and ${currentRisk} budget risk.`
  };
  const alternative = alternatives[0] || null;

  if (!alternative) {
    return {
      current,
      alternatives: [],
      advisorRead: `No calculated lower-capital alternative is currently available; challenge the plan using BOI ${boi.score}/100, budget risk ${currentRisk}, and the listed market-gap priorities.`
    };
  }

  return {
    current,
    alternatives: alternatives.slice(0, 3).map((item) => ({
      title: item.title,
      type: item.type,
      reason: item.reason,
      expectedRisk: item.type === "lower_capital_category" || item.type === "scope_reduction" ? "lower startup risk" : "parallel validation risk"
    })),
    advisorRead: `${alternative.title} has lower startup risk than ${currentTitle} when the current plan is constrained by ${currentRisk} budget risk and BOI ${boi.score}/100.`
  };
}

function riskFromScores({ boiScore, budgetRisk }) {
  if (["Critical", "High"].includes(budgetRisk) || boiScore < 45) {
    return "high";
  }

  if (budgetRisk === "Elevated" || boiScore < 65) {
    return "moderate";
  }

  return "controlled";
}

function buildPivots({ result, alternatives, currentBudgetRisk, currentOpportunity }) {
  const pivots = [];
  const title = result.profile?.title || result.input?.businessType || "selected business";

  if (result.budgetPlan?.isBelowMinimum || currentBudgetRisk === "High" || currentBudgetRisk === "Critical") {
    pivots.push({
      type: "scope_reduction",
      recommendation: `Reduce the ${title} launch scope before signing fixed-cost commitments.`,
      why: `Budget risk is ${currentBudgetRisk}, budget realism is ${result.budgetPlan?.budgetRealismScore || 0}/100, and runway is ${result.budgetPlan?.runwayMonths || 0} months.`
    });
  }

  if (currentOpportunity < 55) {
    pivots.push({
      type: "district_reselection",
      recommendation: "Retest the plan in a stronger district before committing capital.",
      why: `Opportunity score is ${currentOpportunity}/100, so location quality may be a bigger constraint than the business idea itself.`
    });
  }

  if (result.stats?.sampleCount < 6) {
    pivots.push({
      type: "pricing_validation",
      recommendation: "Delay final price positioning until more comparable price evidence is collected.",
      why: `${result.stats?.sampleCount || 0} verified price sample(s) are not enough to support a confident pricing corridor.`
    });
  }

  for (const alternative of alternatives.slice(0, 2)) {
    pivots.push({
      type: alternative.type,
      recommendation: alternative.title,
      why: alternative.reason
    });
  }

  return pivots.slice(0, 5);
}

function buildSentimentScore(competitors) {
  const rated = competitors.filter((competitor) => Number(competitor.rating) > 0);

  if (!rated.length) {
    return 45;
  }

  const weightedTotal = rated.reduce((sum, competitor) => {
    const weight = Math.max(1, Math.min(200, Number(competitor.ratingsCount) || 1));
    return sum + Number(competitor.rating) * weight;
  }, 0);
  const weight = rated.reduce((sum, competitor) => sum + Math.max(1, Math.min(200, Number(competitor.ratingsCount) || 1)), 0);
  const average = weightedTotal / Math.max(1, weight);

  return clampScore((5 - average) * 24 + 32);
}

function saturationPressure(district, result) {
  if (!district) {
    return 50;
  }

  const saturation = String(district.saturation || result.opportunityScore?.saturation || "").toLowerCase();

  if (saturation.includes("high")) {
    return 84;
  }

  if (saturation.includes("medium") || saturation.includes("moderate")) {
    return 56;
  }

  if (saturation.includes("low")) {
    return 24;
  }

  return clampScore(Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0) * 22);
}

function strongestScore(items) {
  return Math.max(1, ...items.map((item) => Number(item.score) || 0));
}

function dedupeByEvidence(items) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const key = [item.type, item.category, item.district, item.segment, item.evidence].filter(Boolean).join("|");

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique.sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

module.exports = {
  buildMarketGapEngine
};
