const { dataVersion, getBusinessProfile } = require("../data/competitors");
const { fetchBusinessesFromOverpass } = require("./overpass");
const { fetchBusinessesFrom2GIS } = require("./twogis");
const { parseMarketPrices } = require("./parser");

async function getCompetitorSnapshot({ city, businessType }) {
  const [twoGisResult, liveBusinessResult] = await Promise.all([
    fetchBusinessesFrom2GIS({ city, businessType }),
    fetchBusinessesFromOverpass({ city, businessType })
  ]);
  const competitors = mergeBusinesses(twoGisResult.businesses, liveBusinessResult.businesses);

  return {
    competitors,
    market: {
      competitorCount: competitors.length,
      areaCounts: countCompetitorsPerArea(competitors),
      density: calculateMarketDensity(competitors.length)
    },
    sources: {
      primary: twoGisResult.source,
      fallback: liveBusinessResult.source
    },
    generatedAt: new Date().toISOString(),
    dataVersion
  };
}

async function getPriceSnapshot({ city, businessType }) {
  const { competitors, sources: businessSources } = await getCompetitorSnapshot({ city, businessType });
  const profile = getBusinessProfile(businessType);
  const structuredPrices = await parseMarketPrices({ city, businessType, competitors });
  const prices = structuredPrices.records;

  return {
    prices,
    stats: calculatePriceStats(prices.map((record) => record.price)),
    profile: {
      title: profile.title,
      priceUnit: profile.priceUnit,
      priceLabels: profile.priceLabels,
      priceMeaning: profile.priceMeaning
    },
    sources: {
      businesses: businessSources,
      prices: structuredPrices.sourceSummary
    },
    generatedAt: new Date().toISOString(),
    dataVersion
  };
}

function mergeBusinesses(...businessGroups) {
  const merged = [];
  const seen = new Set();

  businessGroups.flat().forEach((business) => {
    const key = `${business.name}|${business.address || ""}|${business.area || ""}`.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      merged.push(business);
    }
  });

  return merged;
}

function countCompetitorsPerArea(competitors) {
  return competitors.reduce((counts, competitor) => {
    const area = competitor.area || "Unknown area";
    counts[area] = (counts[area] || 0) + 1;
    return counts;
  }, {});
}

function calculateMarketDensity(count) {
  if (count >= 18) {
    return "High";
  }

  if (count >= 8) {
    return "Medium";
  }

  return "Low";
}

function calculatePriceStats(prices) {
  const validPrices = prices.map(Number).filter((price) => Number.isFinite(price) && price > 0);

  if (!validPrices.length) {
    return {
      minPrice: 0,
      maxPrice: 0,
      averagePrice: 0,
      medianPrice: 0,
      sampleCount: 0
    };
  }

  const sorted = [...validPrices].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const medianPrice = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;

  return {
    minPrice: sorted[0],
    maxPrice: sorted[sorted.length - 1],
    averagePrice: Math.round(validPrices.reduce((sum, price) => sum + price, 0) / validPrices.length),
    medianPrice: Math.round(medianPrice),
    sampleCount: validPrices.length
  };
}

module.exports = {
  getCompetitorSnapshot,
  getPriceSnapshot
};
