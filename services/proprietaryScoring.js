const { getOptions } = require("../data/competitors");

function buildProprietaryScoring({ result }) {
  const drivers = buildDrivers(result);
  const saturationScore = calculateSaturationScore(result);
  const riskScore = calculateRiskScore({ result, drivers, saturationScore });
  const opportunityScore = clampScore(result.opportunityScore?.score || weightedScore([
    { value: drivers.demand, weight: 0.26 },
    { value: drivers.competitionRelief, weight: 0.22 },
    { value: drivers.districtConditions, weight: 0.2 },
    { value: drivers.pricing, weight: 0.14 },
    { value: drivers.budget, weight: 0.12 },
    { value: 100 - saturationScore, weight: 0.06 }
  ]));
  const successProbability = clampScore(result.probability?.successProbability || weightedScore([
    { value: drivers.budget, weight: 0.24 },
    { value: drivers.competitionRelief, weight: 0.14 },
    { value: drivers.demand, weight: 0.18 },
    { value: drivers.districtConditions, weight: 0.16 },
    { value: drivers.pricing, weight: 0.1 },
    { value: 100 - saturationScore, weight: 0.12 },
    { value: drivers.evidence, weight: 0.06 }
  ]));
  const investmentAttractiveness = clampScore(weightedScore([
    { value: opportunityScore, weight: 0.24 },
    { value: successProbability, weight: 0.2 },
    { value: drivers.budget, weight: 0.18 },
    { value: drivers.pricing, weight: 0.12 },
    { value: drivers.demand, weight: 0.12 },
    { value: 100 - riskScore, weight: 0.14 }
  ]));
  const growthPotential = clampScore(result.analyticsEngine?.growthPotential?.topDistrict?.growthScore || weightedScore([
    { value: drivers.demand, weight: 0.42 },
    { value: drivers.districtConditions, weight: 0.28 },
    { value: 100 - saturationScore, weight: 0.18 },
    { value: drivers.competitionRelief, weight: 0.12 }
  ]));
  const categoryBudgetFit = buildCategoryBudgetFit(result);
  const districtComparison = buildDistrictComparison({ result });

  return {
    engine: "TezTap Proprietary Scoring System",
    version: "1.0",
    generatedAt: new Date().toISOString(),
    scores: {
      successProbability,
      opportunityScore,
      riskScore,
      investmentAttractiveness,
      saturationScore,
      growthPotential
    },
    drivers,
    formulaWeights: {
      successProbability: "budget*0.24 + competitionRelief*0.14 + demand*0.18 + districtConditions*0.16 + pricing*0.10 + saturationRelief*0.12 + evidence*0.06",
      opportunityScore: "demand*0.26 + competitionRelief*0.22 + districtConditions*0.20 + pricing*0.14 + budget*0.12 + saturationRelief*0.06",
      riskScore: "budgetRisk*0.32 + competitionRisk*0.20 + saturationRisk*0.22 + pricingRisk*0.14 + demandRisk*0.12",
      investmentAttractiveness: "opportunityScore*0.24 + successProbability*0.20 + budget*0.18 + pricing*0.12 + demand*0.12 + riskRelief*0.14",
      saturationScore: "district saturation, nearby competitors, total competitors, and market density",
      growthPotential: "demand*0.42 + districtConditions*0.28 + saturationRelief*0.18 + competitionRelief*0.12"
    },
    budgetIntelligence: {
      currentBudget: Number(result.input?.budget || result.budgetPlan?.inputBudget || 0),
      minimumViableBudget: result.budgetPlan?.minimumViableBudget || 0,
      budgetShortfall: result.budgetPlan?.budgetShortfall || 0,
      budgetRealismScore: result.budgetPlan?.budgetRealismScore || 0,
      budgetRiskLevel: result.budgetPlan?.budgetRiskLevel || "Unknown",
      realisticCategories: categoryBudgetFit.filter((category) => category.viability === "realistic"),
      constrainedCategories: categoryBudgetFit.filter((category) => category.viability === "constrained"),
      unrealisticCategories: categoryBudgetFit.filter((category) => category.viability === "unrealistic"),
      alternativeRecommendations: buildAlternativeRecommendations({ result, categoryBudgetFit })
    },
    comparisons: {
      scenarios: buildScenarioComparison({ result, districtComparison }),
      districts: districtComparison,
      businessCategories: categoryBudgetFit,
      budgets: buildBudgetComparison({ result })
    },
    guardrail: "Scores are calculated only from current platform analytics, business profiles, budget plan, pricing evidence, competitor density, district metrics, and saturation."
  };
}

function buildDrivers(result) {
  const bestDistrict = result.districtMetrics?.[0] || result.opportunityAreas?.[0] || {};
  const competitorCount = Number(result.market?.competitorCount || 0);
  const nearby = Number(bestDistrict.nearbyCompetitors ?? bestDistrict.competitorCountNearby ?? 0);
  const demand = clampScore(
    (Number(bestDistrict.underservedScore) || 0) * 0.48 +
      (Number(bestDistrict.footTraffic) || 0) * 0.36 +
      (result.analyticsEngine?.growthPotential?.topDistrict?.growthScore || 0) * 0.16
  );
  const competitionRelief = clampScore(100 - Math.min(94, competitorCount * 5 + nearby * 12));
  const districtConditions = clampScore(
    (Number(bestDistrict.footTraffic) || 0) * 0.42 +
      Math.max(0, 100 - Number(bestDistrict.rentIndex || 0)) * 0.26 +
      (Number(bestDistrict.opportunityScore ?? bestDistrict.score) || 0) * 0.32
  );
  const pricing = buildPricingDriver(result);
  const budget = clampScore(result.budgetPlan?.budgetRealismScore || 0);
  const evidence = clampScore(result.analyticsEngine?.confidence?.score ?? result.probability?.assumptions?.evidenceScore ?? 0);

  return {
    budget,
    competitionRelief,
    demand,
    districtConditions,
    pricing,
    saturationRelief: clampScore(100 - calculateSaturationScore(result)),
    evidence
  };
}

function buildPricingDriver(result) {
  const samples = Number(result.stats?.sampleCount || 0);
  const average = Number(result.stats?.avgPrice || 0);
  const spread = Math.max(0, Number(result.stats?.maxPrice || 0) - Number(result.stats?.minPrice || 0));
  const spreadPenalty = average ? Math.min(44, (spread / Math.max(1, average)) * 30) : 60;

  return samples
    ? clampScore(42 + Math.min(36, samples * 4) - spreadPenalty + (result.recommendation?.suggestedPrice ? 12 : 0))
    : 1;
}

function calculateSaturationScore(result) {
  const engineScore = result.analyticsEngine?.saturation?.districts?.[0]?.saturationScore;

  if (Number.isFinite(Number(engineScore))) {
    return clampScore(engineScore);
  }

  const nearby = Number(result.districtMetrics?.[0]?.nearbyCompetitors ?? result.opportunityAreas?.[0]?.competitorCountNearby ?? 0);
  const totalCompetitors = Number(result.market?.competitorCount || 0);
  const density = String(result.market?.density || "").toLowerCase();
  const densityBoost = density.includes("high") ? 22 : density.includes("moderate") ? 12 : 2;

  return clampScore(nearby * 18 + totalCompetitors * 4 + densityBoost);
}

function calculateRiskScore({ result, drivers, saturationScore }) {
  const budgetRisk = clampScore(100 - drivers.budget);
  const competitionRisk = clampScore(100 - drivers.competitionRelief);
  const pricingRisk = clampScore(100 - drivers.pricing);
  const demandRisk = clampScore(100 - drivers.demand);
  const existingRisk = result.analyticsEngine?.riskAnalysis?.riskScore;

  if (Number.isFinite(Number(existingRisk))) {
    return clampScore(
      Number(existingRisk) * 0.55 +
        budgetRisk * 0.18 +
        competitionRisk * 0.1 +
        saturationScore * 0.1 +
        pricingRisk * 0.07
    );
  }

  return clampScore(weightedScore([
    { value: budgetRisk, weight: 0.32 },
    { value: competitionRisk, weight: 0.2 },
    { value: saturationScore, weight: 0.22 },
    { value: pricingRisk, weight: 0.14 },
    { value: demandRisk, weight: 0.12 }
  ]));
}

function buildCategoryBudgetFit(result) {
  const budget = Number(result.input?.budget || result.budgetPlan?.inputBudget || 0);
  const options = getOptions();

  return (options.businessTypes || []).map((businessType) => {
    const profile = options.profiles?.[businessType] || {};
    const minimum = Number(profile.minimumViableBudget || 5000000);
    const adequacyRatio = budget / Math.max(1, minimum);
    const budgetRealismScore = clampScore(adequacyRatio * 100);
    const viability = adequacyRatio >= 1 ? "realistic" : adequacyRatio >= 0.55 ? "constrained" : "unrealistic";

    return {
      businessType,
      title: profile.title || businessType,
      minimumViableBudget: minimum,
      currentBudget: budget,
      budgetShortfall: Math.max(0, minimum - budget),
      adequacyRatio: round(adequacyRatio, 2),
      budgetRealismScore,
      viability,
      recommendedFormat: getRecommendedFormat({ profile, adequacyRatio }),
      reason: buildCategoryBudgetReason({ profile, budget, minimum, adequacyRatio, viability })
    };
  }).sort((left, right) => {
    const order = { realistic: 0, constrained: 1, unrealistic: 2 };
    return order[left.viability] - order[right.viability] || left.minimumViableBudget - right.minimumViableBudget;
  });
}

function buildAlternativeRecommendations({ result, categoryBudgetFit }) {
  const currentType = String(result.input?.businessType || "").toLowerCase();
  const current = categoryBudgetFit.find((category) => category.businessType.toLowerCase() === currentType);
  const alternatives = categoryBudgetFit.filter((category) => category.businessType.toLowerCase() !== currentType);

  if (current?.viability === "realistic") {
    return alternatives
      .filter((category) => category.viability === "realistic")
      .slice(0, 3)
      .map((category) => ({
        type: "parallel_realistic_category",
        businessType: category.businessType,
        title: category.title,
        reason: `${category.title} is also realistic at the entered budget with ${category.budgetRealismScore}/100 budget realism.`
      }));
  }

  const lowerCost = alternatives.filter((category) => category.viability !== "unrealistic").slice(0, 3);
  const scopedCurrent = current
    ? [{
        type: "scope_reduction",
        businessType: current.businessType,
        title: current.title,
        reason: `${current.title} full launch is ${current.viability}; use a lower-scope format: ${current.recommendedFormat}.`
      }]
    : [];

  return [
    ...scopedCurrent,
    ...lowerCost.map((category) => ({
      type: "lower_capital_category",
      businessType: category.businessType,
      title: category.title,
      reason: `${category.title} needs ${category.minimumViableBudget} KZT minimum viable budget and is ${category.viability} for the entered budget.`
    }))
  ].slice(0, 4);
}

function buildDistrictComparison({ result }) {
  return (result.districtMetrics || result.opportunityAreas || []).map((district) => {
    const nearby = Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0);
    const saturationScore = district.saturation === "high" ? 84 : district.saturation === "medium" ? 56 : district.saturation === "low" ? 24 : clampScore(nearby * 22);
    const opportunityScore = Number(district.opportunityScore ?? district.score) || 0;
    const footTraffic = Number(district.footTraffic) || 0;
    const underservedScore = Number(district.underservedScore) || 0;
    const rentFit = Math.max(0, 100 - Number(district.rentIndex || 0));
    const investmentAttractiveness = clampScore(
      opportunityScore * 0.34 +
        underservedScore * 0.22 +
        footTraffic * 0.2 +
        rentFit * 0.14 +
        (100 - saturationScore) * 0.1
    );
    const recommendation = investmentAttractiveness >= 72 ? "priority district" : investmentAttractiveness >= 55 ? "pilot candidate" : "validation only";

    return {
      district: district.district || district.name,
      opportunityScore,
      saturationScore,
      growthPotential: clampScore(underservedScore * 0.42 + footTraffic * 0.32 + (100 - saturationScore) * 0.26),
      investmentAttractiveness,
      nearbyCompetitors: nearby,
      footTraffic,
      underservedScore,
      rentFit,
      recommendation,
      why: buildDistrictComparisonWhy({
        district: district.district || district.name,
        opportunityScore,
        saturationScore,
        growthPotential: clampScore(underservedScore * 0.42 + footTraffic * 0.32 + (100 - saturationScore) * 0.26),
        nearby,
        footTraffic,
        underservedScore,
        rentFit,
        recommendation
      })
    };
  }).sort((left, right) => right.investmentAttractiveness - left.investmentAttractiveness);
}

function buildScenarioComparison({ result, districtComparison }) {
  const candidates = districtComparison.slice(0, 2);

  return candidates.map((district, index) => {
    const scenario = buildDistrictScenario({ result, district });

    return {
      label: index === 0 ? "Scenario A" : "Scenario B",
      businessType: result.profile?.title || result.input?.businessType || "Selected business",
      district: district.district,
      ...scenario
    };
  });
}

function buildDistrictScenario({ result, district }) {
  const budgetScore = clampScore(result.budgetPlan?.budgetRealismScore || 0);
  const pricingScore = buildPricingDriver(result);
  const evidenceScore = clampScore(result.analyticsEngine?.confidence?.score ?? result.probability?.assumptions?.evidenceScore ?? 0);
  const competitionRelief = clampScore(100 - Math.min(94, district.nearbyCompetitors * 16));
  const saturationRelief = clampScore(100 - district.saturationScore);
  const demandScore = clampScore(district.underservedScore * 0.5 + district.footTraffic * 0.34 + district.growthPotential * 0.16);
  const districtConditions = clampScore(district.footTraffic * 0.42 + district.rentFit * 0.24 + district.opportunityScore * 0.34);
  const opportunityScore = clampScore(weightedScore([
    { value: demandScore, weight: 0.27 },
    { value: competitionRelief, weight: 0.2 },
    { value: districtConditions, weight: 0.2 },
    { value: pricingScore, weight: 0.13 },
    { value: budgetScore, weight: 0.12 },
    { value: saturationRelief, weight: 0.08 }
  ]));
  const riskScore = clampScore(weightedScore([
    { value: 100 - budgetScore, weight: 0.3 },
    { value: 100 - competitionRelief, weight: 0.2 },
    { value: district.saturationScore, weight: 0.22 },
    { value: 100 - pricingScore, weight: 0.14 },
    { value: 100 - demandScore, weight: 0.14 }
  ]));
  const successProbability = clampScore(weightedScore([
    { value: budgetScore, weight: 0.22 },
    { value: opportunityScore, weight: 0.22 },
    { value: demandScore, weight: 0.17 },
    { value: competitionRelief, weight: 0.13 },
    { value: districtConditions, weight: 0.12 },
    { value: pricingScore, weight: 0.08 },
    { value: evidenceScore, weight: 0.06 }
  ]));

  return {
    successProbability,
    riskScore,
    opportunityScore,
    investmentAttractiveness: district.investmentAttractiveness,
    recommendation: successProbability >= 70 ? "prioritize validation" : successProbability >= 52 ? "pilot carefully" : "high-risk scenario",
    why: buildScenarioWhy({
      district,
      successProbability,
      riskScore,
      opportunityScore,
      budgetScore,
      pricingScore,
      demandScore,
      competitionRelief,
      saturationRelief,
      evidenceScore
    }),
    drivers: {
      budget: budgetScore,
      pricing: pricingScore,
      demand: demandScore,
      competitionRelief,
      saturationRelief,
      districtConditions,
      evidence: evidenceScore
    }
  };
}

function buildScenarioWhy({ district, successProbability, riskScore, opportunityScore, budgetScore, pricingScore, demandScore, competitionRelief, saturationRelief, evidenceScore }) {
  return [
    `${district.district} produces ${successProbability}% success probability because opportunity is ${opportunityScore}/100, risk is ${riskScore}/100, demand is ${demandScore}/100, and competition relief is ${competitionRelief}/100.`,
    `The district has ${district.nearbyCompetitors} nearby competitors, ${district.underservedScore}/100 underserved demand, ${district.footTraffic}/100 foot traffic, and ${district.saturationScore}/100 saturation pressure.`,
    `Budget realism is ${budgetScore}/100, pricing evidence is ${pricingScore}/100, and platform evidence confidence is ${evidenceScore}/100.`
  ].join(" ");
}

function buildDistrictComparisonWhy({ district, opportunityScore, saturationScore, growthPotential, nearby, footTraffic, underservedScore, rentFit, recommendation }) {
  return `${district} is marked as ${recommendation} because opportunityScore is ${opportunityScore}/100, growthPotential is ${growthPotential}/100, saturationScore is ${saturationScore}/100, nearby competitors are ${nearby}, footTraffic is ${footTraffic}/100, underservedScore is ${underservedScore}/100, and rentFit is ${rentFit}/100.`;
}

function buildBudgetComparison({ result }) {
  const currentBudget = Number(result.input?.budget || result.budgetPlan?.inputBudget || 0);
  const minimum = Number(result.budgetPlan?.minimumViableBudget || 0);
  const budgets = Array.from(new Set([
    currentBudget,
    Math.round(currentBudget * 1.5),
    minimum,
    Math.round(minimum * 1.25)
  ].filter((value) => Number.isFinite(value) && value > 0))).sort((left, right) => left - right);

  return budgets.map((budget) => {
    const adequacyRatio = budget / Math.max(1, minimum);
    const budgetRealismScore = clampScore(adequacyRatio * 100);
    const viability = adequacyRatio >= 1 ? "realistic" : adequacyRatio >= 0.55 ? "constrained" : "unrealistic";

    return {
      budget,
      adequacyRatio: round(adequacyRatio, 2),
      budgetRealismScore,
      viability,
      riskLevel: adequacyRatio >= 1 ? "Controlled" : adequacyRatio >= 0.55 ? "High" : "Critical",
      implication: adequacyRatio >= 1
        ? "Supports a full controlled launch for the selected category."
        : adequacyRatio >= 0.55
          ? "Requires reduced scope, smaller format, or phased launch."
          : "Does not support a full launch for the selected category."
    };
  });
}

function getRecommendedFormat({ profile, adequacyRatio }) {
  if (adequacyRatio >= 1) {
    return "full launch";
  }

  if (adequacyRatio >= 0.55) {
    return `compact or phased ${String(profile.title || "business").toLowerCase()} format`;
  }

  return `micro-format, kiosk, pop-up, online-first, or postpone until capital reaches minimum viable budget`;
}

function buildCategoryBudgetReason({ profile, budget, minimum, adequacyRatio, viability }) {
  if (viability === "realistic") {
    return `${budget} KZT meets or exceeds the ${minimum} KZT minimum viable budget for ${profile.title || "this category"}.`;
  }

  if (viability === "constrained") {
    return `${budget} KZT covers ${Math.round(adequacyRatio * 100)}% of the ${minimum} KZT minimum viable budget, so only a reduced-scope launch is realistic.`;
  }

  return `${budget} KZT is below the ${minimum} KZT minimum viable budget, so a full launch is unrealistic without more capital or a smaller format.`;
}

function weightedScore(items) {
  return items.reduce((sum, item) => sum + (Number(item.value) || 0) * item.weight, 0);
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

module.exports = {
  buildProprietaryScoring
};
