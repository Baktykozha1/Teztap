function buildAiNarratives({ result }) {
  const stats = result.stats;
  const market = result.market;
  const probability = result.probability;
  const recommendation = result.recommendation;
  const opportunityScore = result.opportunityScore;
  const bestArea = result.opportunityAreas[0];
  const bestAreaText = bestArea
    ? `${bestArea.name}: score ${bestArea.score}/100, ${bestArea.competitorCountNearby} nearby competitors, ${bestArea.footTraffic}/100 foot traffic, ${bestArea.underservedScore}/100 underserved demand.`
    : "No ranked district was returned by the scoring engine.";
  const priceText = stats.sampleCount
    ? `${stats.sampleCount} product-level price records show an average of ${stats.avgPrice} KZT.`
    : "No verified product-level prices were found; the platform does not recommend a launch price.";
  const budgetText = result.budgetPlan.isBelowMinimum
    ? ` A budget of ${result.budgetPlan.inputBudget} KZT is not realistic for ${result.profile.title}; it is ${result.budgetPlan.budgetShortfall} KZT below the ${result.budgetPlan.minimumViableBudget} KZT minimum viable threshold.`
    : ` Budget realism is ${result.budgetPlan.budgetRealismScore}/100 with ${result.budgetPlan.runwayMonths} months modeled runway.`;
  const availableScoreFactors = [
    `budget realism (${opportunityScore.factors.budgetRealism}/100)`,
    Number.isFinite(opportunityScore.factors.profitability) ? `profitability (${opportunityScore.factors.profitability}/100)` : null,
    Number.isFinite(opportunityScore.factors.underservedDemand) ? `demand (${opportunityScore.factors.underservedDemand}/100)` : null,
    `saturation (${opportunityScore.factors.saturation}/100)`
  ].filter(Boolean).join(", ");

  return {
    assistant: null,
    overview:
      `${market.competitorCount} competitors were detected. ${priceText} Market signal: ${result.analytics.marketSignal}.`,
    competitors:
      `Competition density is ${market.density.toLowerCase()}; district scoring uses competitor count, nearby density, saturation, foot traffic, and underserved demand.`,
    prices:
      `${priceText}`,
    map:
      bestAreaText,
    score:
      `Opportunity score is ${opportunityScore.score}/100. Available inputs are ${availableScoreFactors}.${budgetText}`,
    probability:
      `${probability.level}: success probability is ${probability.successProbability}%, profitability probability is ${probability.profitabilityProbability}%, and survival probability is ${probability.survivalProbability}%.${budgetText}`,
    recommendations:
      `${recommendation.explanation} Pricing stance: ${recommendation.pricingStrategy}`,
    growth:
      `Growth signals use ranked districts, price evidence, payback months, runway, and modeled net profit.`,
    investor:
      result.investorDecision
        ? `${result.investorDecision.investmentMemo.verdict}. Data confidence is ${result.investorDecision.dataRoom.score}/100 from competitor coverage, price evidence, district coverage, budget realism, and runway.`
        : null
  };
}

function buildGrowthInsights({ result }) {
  const bestArea = result.opportunityAreas[0];
  const secondArea = result.opportunityAreas[1];
  const payback = result.probability.assumptions.paybackMonths;
  const priceGap = result.stats.maxPrice && result.recommendation.suggestedPrice
    ? result.stats.maxPrice - result.recommendation.suggestedPrice
    : null;
  const projectedNetProfit = result.probability.assumptions.projectedNetProfit;

  return [
    {
      title: "Launch wedge",
      impact: bestArea ? `${bestArea.score}/100` : "No district score",
      body: bestArea
        ? `${bestArea.name}: ${bestArea.competitorCountNearby} nearby competitors, ${bestArea.footTraffic}/100 traffic, ${bestArea.underservedScore}/100 underserved demand.`
        : "No launch wedge is recommended until district records are available."
    },
    {
      title: "Pricing power",
      impact: result.stats.sampleCount ? `${result.stats.sampleCount} samples` : "Evidence gap",
      body: result.stats.sampleCount
        ? `Suggested price ${result.recommendation.suggestedPrice} KZT; observed range ${result.stats.minPrice}-${result.stats.maxPrice} KZT; headroom below max ${priceGap} KZT.`
        : "No pricing action is recommended until product-level prices are collected."
    },
    {
      title: "Expansion path",
      impact: secondArea ? `${secondArea.score}/100` : "Not available",
      body: secondArea
        ? `${secondArea.name}: score ${secondArea.score}/100, saturation ${secondArea.saturation}, ${secondArea.competitorCountNearby} nearby competitors.`
        : "Expansion is not scored because fewer than two ranked districts were returned."
    },
    {
      title: "Payback signal",
      impact: payback ? `${payback} months` : "Negative profit",
      body: payback
        ? `Payback is ${payback} months from projected monthly net profit of ${projectedNetProfit} KZT.`
        : `Projected monthly net profit is ${projectedNetProfit} KZT, so payback is not positive.`
    }
  ].filter((item) => item.body);
}

module.exports = {
  buildAiNarratives,
  buildGrowthInsights
};
