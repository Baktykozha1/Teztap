function buildChartData({ profile, competitors, prices, stats, budgetPlan, opportunityAreas }) {
  return {
    priceDistribution: buildPriceDistribution(prices, stats),
    categoryPrices: buildCategoryPrices(prices),
    districtComparison: opportunityAreas.map((area) => ({
      district: area.name,
      score: area.score,
      footTraffic: area.footTraffic,
      underserved: area.underservedScore,
      competitors: area.competitorCountNearby,
      rentIndex: area.rentIndex
    })),
    marketSaturation: buildMarketSaturation(competitors, opportunityAreas),
    profitabilityProjection: buildProfitabilityProjection({ profile, stats, budgetPlan }),
    ratingDistribution: buildRatingDistribution(competitors)
  };
}

function buildPriceDistribution(prices, stats) {
  if (!prices.length || !stats.maxPrice) {
    return [];
  }

  const bucketCount = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(prices.length))));
  const spread = Math.max(1, stats.maxPrice - stats.minPrice);
  const bucketSize = Math.ceil(spread / bucketCount);
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const min = stats.minPrice + index * bucketSize;
    const max = index === bucketCount - 1 ? stats.maxPrice : min + bucketSize - 1;

    return {
      range: `${min}-${max}`,
      min,
      max,
      count: 0,
      avg: 0
    };
  });

  for (const record of prices) {
    const index = Math.min(bucketCount - 1, Math.floor((record.price - stats.minPrice) / bucketSize));
    buckets[index].count += 1;
    buckets[index].avg += record.price;
  }

  return buckets.map((bucket) => ({
    range: bucket.range,
    count: bucket.count,
    averagePrice: bucket.count ? Math.round(bucket.avg / bucket.count) : 0
  }));
}

function buildCategoryPrices(prices) {
  const groups = new Map();

  for (const record of prices) {
    const key = record.category || "Other";
    const current = groups.get(key) || { category: key, total: 0, count: 0 };
    current.total += Number(record.price) || 0;
    current.count += 1;
    groups.set(key, current);
  }

  return Array.from(groups.values())
    .map((group) => ({
      category: group.category,
      averagePrice: Math.round(group.total / group.count),
      count: group.count
    }))
    .sort((left, right) => right.averagePrice - left.averagePrice)
    .slice(0, 8);
}

function buildMarketSaturation(competitors, opportunityAreas) {
  const counts = competitors.reduce((result, competitor) => {
    const area = competitor.area || "Unlisted";
    result[area] = (result[area] || 0) + 1;
    return result;
  }, {});

  const fromAreas = opportunityAreas.map((area) => ({
    district: area.name,
    competitors: counts[area.name] || area.competitorCountNearby || 0,
    saturation: area.saturation === "high" ? 85 : area.saturation === "medium" ? 56 : 26,
    opportunity: area.score
  }));

  const existingOnly = Object.entries(counts)
    .filter(([area]) => !fromAreas.some((row) => row.district === area))
    .map(([area, count]) => ({
      district: area,
      competitors: count,
      saturation: Math.min(100, count * 24),
      opportunity: null
    }));

  return [...fromAreas, ...existingOnly].sort((left, right) => right.competitors - left.competitors);
}

function buildProfitabilityProjection({ profile, stats, budgetPlan }) {
  if (!stats.avgPrice || !budgetPlan.plannedTransactions) {
    return [];
  }

  const averagePrice = stats.avgPrice;
  const plannedTransactions = budgetPlan.plannedTransactions;
  const rows = [];

  for (let month = 1; month <= 12; month += 1) {
    const ramp = 0.52 + month * 0.045;
    const transactions = Math.round(plannedTransactions * Math.min(1.1, ramp));
    const revenue = Math.round(transactions * averagePrice);
    const grossProfit = Math.round(revenue * profile.targetMargin);
    const operatingCost = budgetPlan.monthlyOperatingCost;
    const netProfit = grossProfit - operatingCost;

    rows.push({
      month: `M${month}`,
      transactions,
      revenue,
      grossProfit,
      operatingCost,
      netProfit
    });
  }

  return rows;
}

function buildRatingDistribution(competitors) {
  const buckets = [
    { range: "0-3.4", count: 0 },
    { range: "3.5-4.1", count: 0 },
    { range: "4.2-4.6", count: 0 },
    { range: "4.7-5.0", count: 0 },
    { range: "No rating", count: 0 }
  ];

  for (const competitor of competitors) {
    const rating = Number(competitor.rating);

    if (!Number.isFinite(rating) || rating <= 0) {
      buckets[4].count += 1;
    } else if (rating < 3.5) {
      buckets[0].count += 1;
    } else if (rating < 4.2) {
      buckets[1].count += 1;
    } else if (rating < 4.7) {
      buckets[2].count += 1;
    } else {
      buckets[3].count += 1;
    }
  }

  return buckets;
}

module.exports = {
  buildChartData
};
