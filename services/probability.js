function buildProbabilityModel({ profile, competitors, stats, budgetPlan, opportunityScore, opportunityAreas }) {
  const bestArea = opportunityAreas[0] || null;
  const normalizedMetrics = calculateNormalizedMetrics({
    competitors,
    stats,
    budgetPlan,
    opportunityScore,
    opportunityAreas
  });
  const demandScore = normalizedMetrics.estimatedDemand;
  const evidenceScore = calculateEvidenceScore({ competitors, stats });
  const runwayScore = clampScore((budgetPlan.runwayMonths / 9) * 100);
  const budgetRealismScore = normalizedMetrics.budgetRealism;
  const successWeights = [
    { key: "budgetRealism", label: "Budget realism", weight: 23 },
    { key: "competitorCount", label: "Competitor count", weight: 10 },
    { key: "ratings", label: "Rating gap", weight: 7 },
    { key: "estimatedDemand", label: "Estimated demand", weight: 15 },
    { key: "pricingSpread", label: "Pricing spread", weight: 7 },
    { key: "districtActivity", label: "District activity", weight: 12 },
    { key: "businessDensity", label: "Business density", weight: 9 },
    { key: "saturation", label: "Saturation", weight: 10 },
    { key: "marketGaps", label: "Market gaps", weight: 7 }
  ];
  const profitabilityWeights = [
    { key: "budgetRealism", label: "Budget realism", weight: 25 },
    { key: "pricingSpread", label: "Pricing spread", weight: 13 },
    { key: "estimatedDemand", label: "Estimated demand", weight: 13 },
    { key: "districtActivity", label: "District activity", weight: 9 },
    { key: "marketGaps", label: "Market gaps", weight: 9 },
    { key: "saturation", label: "Saturation", weight: 8 },
    { key: "runway", label: "Runway", weight: 11 },
    { key: "unitEconomics", label: "Unit economics", weight: 12 }
  ];
  const survivalWeights = [
    { key: "budgetRealism", label: "Budget realism", weight: 28 },
    { key: "runway", label: "Runway", weight: 18 },
    { key: "competitorCount", label: "Competitor count", weight: 11 },
    { key: "businessDensity", label: "Business density", weight: 10 },
    { key: "saturation", label: "Saturation", weight: 12 },
    { key: "ratings", label: "Rating gap", weight: 6 },
    { key: "evidence", label: "Evidence quality", weight: 7 },
    { key: "estimatedDemand", label: "Estimated demand", weight: 8 }
  ];
  const rawSuccessProbability = weightedScore(normalizedMetrics, successWeights);
  const rawProfitabilityProbability = weightedScore(normalizedMetrics, profitabilityWeights);
  const rawSurvivalProbability = weightedScore(normalizedMetrics, survivalWeights);
  const priceBasis = stats.avgPrice || 0;
  const projectedMonthlyRevenue = priceBasis
    ? Math.round(priceBasis * (budgetPlan.plannedTransactions || profile.monthlyTransactions))
    : 0;
  const projectedGrossProfit = Math.round(projectedMonthlyRevenue * profile.targetMargin);
  const projectedNetProfit = projectedGrossProfit - budgetPlan.monthlyOperatingCost;
  const budgetCap = calculateBudgetProbabilityCap({ budgetPlan, normalizedMetrics, projectedNetProfit });
  const successProbability = applyBudgetCap(rawSuccessProbability, budgetCap.success);
  const profitabilityProbability = applyBudgetCap(rawProfitabilityProbability, budgetCap.profitability);
  const survivalProbability = applyBudgetCap(rawSurvivalProbability, budgetCap.survival);
  const paybackMonths = projectedNetProfit > 0
    ? Math.max(1, Math.ceil((budgetPlan.startupReserve || 0) / projectedNetProfit))
    : null;

  return {
    successProbability,
    profitabilityProbability,
    survivalProbability,
    level: successProbability >= 75 ? "Investor-ready test" : successProbability >= 58 ? "Promising pilot" : "Risk-heavy idea",
    bestDistrict: bestArea?.name || opportunityScore.bestDistrict,
    assumptions: {
      demandScore,
      evidenceScore,
      runwayScore,
      normalizedMetrics,
      priceBasis,
      monthlyTransactions: budgetPlan.plannedTransactions || profile.monthlyTransactions,
      targetMarginPercent: Math.round(profile.targetMargin * 100),
      monthlyOperatingCost: budgetPlan.monthlyOperatingCost,
      minimumViableBudget: budgetPlan.minimumViableBudget,
      budgetAdequacyRatio: budgetPlan.budgetAdequacyRatio,
      budgetRealismScore,
      budgetShortfall: budgetPlan.budgetShortfall,
      budgetRiskLevel: budgetPlan.budgetRiskLevel,
      budgetCap,
      projectedMonthlyRevenue,
      projectedGrossProfit,
      projectedNetProfit,
      paybackMonths
    },
    formulas: [
      {
        label: "Success probability",
        expression: "budget realism * 0.23 + competitor count * 0.10 + rating gap * 0.07 + demand * 0.15 + pricing spread * 0.07 + district activity * 0.12 + density * 0.09 + saturation * 0.10 + market gaps * 0.07, then capped by budget adequacy",
        result: `${successProbability}%`,
        factors: successWeights.map((factor) => ({
          label: factor.label,
          value: normalizedMetrics[factor.key],
          weight: factor.weight
        }))
      },
      {
        label: "Monthly net profit",
        expression: "(average price * planned transactions * target margin) - monthly operating cost",
        result: `${projectedNetProfit} KZT`,
        factors: [
          { label: "Average price", value: priceBasis || "n/a", unit: priceBasis ? "KZT" : "" },
          { label: "Transactions", value: budgetPlan.plannedTransactions || profile.monthlyTransactions, unit: "mo" },
          { label: "Margin", value: Math.round(profile.targetMargin * 100), unit: "%" },
          { label: "Operating cost", value: budgetPlan.monthlyOperatingCost, unit: "KZT" }
        ]
      },
      {
        label: "Survival probability",
        expression: "budget realism * 0.28 + runway * 0.18 + competitor count * 0.11 + density * 0.10 + saturation * 0.12 + rating gap * 0.06 + evidence * 0.07 + demand * 0.08, then capped by budget adequacy",
        result: `${survivalProbability}%`,
        factors: survivalWeights.map((factor) => ({
          label: factor.label,
          value: normalizedMetrics[factor.key],
          weight: factor.weight
        }))
      },
      {
        label: "Profitability probability",
        expression: "budget realism * 0.25 + pricing spread * 0.13 + demand * 0.13 + district activity * 0.09 + market gaps * 0.09 + saturation * 0.08 + runway * 0.11 + unit economics * 0.12, then capped by budget adequacy",
        result: `${profitabilityProbability}%`,
        factors: profitabilityWeights.map((factor) => ({
          label: factor.label,
          value: normalizedMetrics[factor.key],
          weight: factor.weight
        }))
      }
    ],
    explanation: buildProbabilityExplanation({
      successProbability,
      profitabilityProbability,
      survivalProbability,
      bestArea,
      evidenceScore,
      runwayScore,
      normalizedMetrics,
      projectedNetProfit,
      budgetPlan
    })
  };
}

function calculateNormalizedMetrics({ competitors, stats, budgetPlan, opportunityScore, opportunityAreas }) {
  const bestArea = opportunityAreas[0] || null;
  const competitorCount = competitors.length;
  const averageRating = calculateAverageRating(competitors);
  const priceSpreadPercent = stats.avgPrice
    ? ((stats.maxPrice - stats.minPrice) / Math.max(1, stats.avgPrice)) * 100
    : 0;
  const demandScore = calculateDemandScore(opportunityAreas);
  const densityScore = bestArea
    ? clampScore(100 - Math.min(90, bestArea.competitorCountNearby * 22))
    : opportunityScore.factors.competition;
  const marketGapScore = calculateMarketGapScore(opportunityAreas);
  const evidenceScore = calculateEvidenceScore({ competitors, stats });
  const runwayScore = clampScore((budgetPlan.runwayMonths / 9) * 100);
  const budgetRealismScore = clampScore(budgetPlan.budgetRealismScore || 1);
  const unitEconomicsScore = budgetPlan.grossProfitPerTransaction
    ? clampScore((budgetPlan.grossProfitPerTransaction / Math.max(1, stats.avgPrice || budgetPlan.grossProfitPerTransaction)) * 420)
    : 1;

  return {
    competitorCount: clampScore(100 - Math.min(92, competitorCount * 5.8)),
    ratings: averageRating ? clampScore((5 - averageRating) * 24 + 12) : 1,
    estimatedDemand: demandScore,
    pricingSpread: stats.sampleCount ? clampScore(72 - Math.min(42, priceSpreadPercent * 0.45) + Math.min(18, stats.sampleCount * 1.2)) : 1,
    districtActivity: bestArea ? clampScore(bestArea.footTraffic * 0.68 + (100 - bestArea.rentIndex) * 0.12 + bestArea.score * 0.2) : 1,
    businessDensity: densityScore,
    saturation: opportunityScore.factors.saturation,
    marketGaps: marketGapScore,
    budgetRealism: budgetRealismScore,
    runway: runwayScore,
    evidence: evidenceScore,
    unitEconomics: unitEconomicsScore
  };
}

function calculateBudgetProbabilityCap({ budgetPlan, normalizedMetrics, projectedNetProfit }) {
  const adequacyRatio = Number(budgetPlan.budgetAdequacyRatio) || 0;
  const budgetRealism = Number(normalizedMetrics.budgetRealism) || 1;
  const runway = Number(normalizedMetrics.runway) || 1;
  const unitEconomics = Number(normalizedMetrics.unitEconomics) || 1;
  const capitalBase = clampScore(adequacyRatio * 100);

  if (adequacyRatio >= 1) {
    return {
      success: 100,
      profitability: 100,
      survival: 100
    };
  }

  const shortfallSeverity = 1 - Math.max(0, Math.min(1, adequacyRatio));
  const baseCap = clampScore(
    budgetRealism * 0.48 +
      capitalBase * 0.24 +
      runway * 0.16 +
      unitEconomics * 0.12 -
      shortfallSeverity * 22
  );

  return {
    success: clampScore(baseCap),
    profitability: clampScore((baseCap * 0.9 + unitEconomics * 0.1) * (projectedNetProfit > 0 ? 1 : 0.35)),
    survival: clampScore(baseCap * 0.82 + runway * 0.18)
  };
}

function applyBudgetCap(score, cap) {
  return clampScore(Math.min(score, cap));
}

function calculateDemandScore(opportunityAreas) {
  if (!opportunityAreas.length) {
    return 1;
  }

  const topAreas = opportunityAreas.slice(0, 3);
  const total = topAreas.reduce((sum, area) => {
    return sum + area.footTraffic * 0.52 + area.underservedScore * 0.32 + area.score * 0.16;
  }, 0);

  return clampScore(total / topAreas.length);
}

function calculateMarketGapScore(opportunityAreas) {
  if (!opportunityAreas.length) {
    return 1;
  }

  const topAreas = opportunityAreas.slice(0, 3);
  const total = topAreas.reduce((sum, area) => {
    const lowSaturationBonus = area.saturation === "low" ? 14 : area.saturation === "medium" ? 6 : -8;
    const competitorGap = 100 - Math.min(92, (area.competitorCountNearby || 0) * 24);
    return sum + area.underservedScore * 0.52 + competitorGap * 0.34 + lowSaturationBonus;
  }, 0);

  return clampScore(total / topAreas.length);
}

function calculateEvidenceScore({ competitors, stats }) {
  const competitorSignal = Math.min(100, competitors.length * 9);
  const priceSignal = Math.min(100, stats.sampleCount * 8);
  const ratingSignal = competitors.some((competitor) => Number(competitor.rating) > 0) ? 82 : 48;

  return clampScore(competitorSignal * 0.38 + priceSignal * 0.38 + ratingSignal * 0.24);
}

function buildProbabilityExplanation({
  successProbability,
  profitabilityProbability,
  survivalProbability,
  bestArea,
  evidenceScore,
  runwayScore,
  normalizedMetrics,
  projectedNetProfit,
  budgetPlan
}) {
  const district = bestArea?.name || "the strongest available district";
  const profitSignal = projectedNetProfit > 0 ? "positive modeled monthly profit" : "negative modeled monthly profit";
  const budgetWarning = budgetPlan?.isBelowMinimum
    ? ` A budget of ${budgetPlan.inputBudget || "the submitted amount"} KZT is below the ${budgetPlan.minimumViableBudget} KZT minimum viable budget, leaving a ${budgetPlan.budgetShortfall} KZT funding gap.`
    : "";

  return (
    `${district} reaches a ${successProbability}% success probability from normalized market inputs: ` +
    `budget realism ${normalizedMetrics.budgetRealism}/100, ` +
    `demand ${normalizedMetrics.estimatedDemand}/100, saturation ${normalizedMetrics.saturation}/100, ` +
    `density ${normalizedMetrics.businessDensity}/100, market gaps ${normalizedMetrics.marketGaps}/100, ` +
    `pricing spread ${normalizedMetrics.pricingSpread}/100, evidence ${evidenceScore}/100, ` +
    `runway ${runwayScore}/100, plus ${profitabilityProbability}% profitability probability, ` +
    `${survivalProbability}% survival probability, and ${profitSignal}.${budgetWarning}`
  );
}

function weightedScore(metrics, weights) {
  const totalWeight = weights.reduce((sum, factor) => sum + factor.weight, 0);
  const total = weights.reduce((sum, factor) => sum + (Number(metrics[factor.key]) || 0) * factor.weight, 0);

  return clampScore(total / totalWeight);
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

function clampScore(value) {
  return Math.max(1, Math.min(100, Math.round(Number(value) || 0)));
}

module.exports = {
  buildProbabilityModel
};
