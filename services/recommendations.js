function createAiRecommendation({ bestLocation, stats, competitors, opportunityScore, strategy, budgetPlan }) {
  const district = bestLocation?.name || opportunityScore.bestDistrict || null;
  const avgRating = calculateAverageRating(competitors);
  const densityPhrase = bestLocation
    ? `${bestLocation.competitorCountNearby} competitors within the district radius`
    : "no ranked district returned by the scoring engine";
  const pricePhrase = stats.avgPrice
    ? `${stats.sampleCount} verified price samples average ${stats.avgPrice} KZT`
    : "0 verified product-level price samples";
  const ratingPhrase = avgRating
    ? `weighted competitor rating is ${round(avgRating, 1)}/5`
    : "competitor ratings were not strong enough to use as a primary signal";
  const pricingStrategy = stats.avgPrice
    ? `${strategy.pricePosition}: launch near ${strategy.suggestedPrice} KZT, stay below the observed average until reviews and repeat traffic improve.`
    : "No launch price is recommended until product-level price samples are collected.";

  if (!district) {
    return {
      pricingStrategy,
      explanation:
        `No district recommendation was generated because the scoring engine returned no ranked location. ` +
        `Current evidence: ${competitors.length} competitors, ${stats.sampleCount} price samples, opportunity score ${opportunityScore.score}/100.`
    };
  }

  return {
    pricingStrategy,
    explanation:
      budgetPlan?.isBelowMinimum
        ? `Do not treat this as launch-ready: a budget of ${budgetPlan.inputBudget} KZT is not realistic for this business category because it is ${budgetPlan.budgetShortfall} KZT below the ${budgetPlan.minimumViableBudget} KZT minimum viable threshold. The low score is driven by budget realism, runway, competition, saturation, estimated demand, and district economics.`
        : `${district} is the top-ranked district because it combines ${densityPhrase}, ${pricePhrase}, and ${opportunityScore.saturation.toLowerCase()}. ` +
          `${ratingPhrase}. Opportunity score is ${opportunityScore.score}/100, driven by budget realism, competition, pricing, underserved demand, saturation, and estimated profitability.`
  };
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

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

module.exports = {
  createAiRecommendation
};
