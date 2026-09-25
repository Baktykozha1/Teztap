function buildCityEconomicIndicator({ result }) {
  const districts = result.districtMetrics?.length ? result.districtMetrics : result.opportunityAreas || [];
  const competitors = result.competitors || [];
  const categoryStats = result.businessCategoryStats || [];
  const proprietaryScores = result.proprietaryScoring?.scores || {};

  const businessActivity = calculateBusinessActivity({ result, districts, competitors });
  const competitionDensity = calculateCompetitionDensity({ result, districts, competitors });
  const investmentAttractiveness = calculateInvestmentAttractiveness({ result, districts, proprietaryScores });
  const entrepreneurshipGrowth = calculateEntrepreneurshipGrowth({ result, districts });
  const marketDiversity = calculateMarketDiversity({ result, categoryStats, competitors });
  const compositeScore = clampScore(
    businessActivity.score * 0.22 +
      (100 - competitionDensity.score) * 0.16 +
      investmentAttractiveness.score * 0.24 +
      entrepreneurshipGrowth.score * 0.2 +
      marketDiversity.score * 0.18
  );

  return {
    layer: "TezTap City-Wide Economic Indicator",
    version: "1.0",
    city: result.input?.city || null,
    generatedAt: new Date().toISOString(),
    compositeScore,
    label: compositeScore >= 75 ? "High-opportunity city market" : compositeScore >= 55 ? "Selective opportunity market" : "Validation-first market",
    indicators: {
      businessActivity,
      competitionDensity,
      investmentAttractiveness,
      entrepreneurshipGrowth,
      marketDiversity
    },
    trendSeries: buildCityTrendSeries({
      result,
      businessActivity,
      competitionDensity,
      investmentAttractiveness,
      entrepreneurshipGrowth,
      marketDiversity,
      compositeScore
    }),
    why: [
      `Business activity is ${businessActivity.score}/100 from competitor presence, district traffic, and pricing evidence.`,
      `Competition density is ${competitionDensity.score}/100 from total competitors and district-level nearby competitors.`,
      `Investment attractiveness is ${investmentAttractiveness.score}/100 from district attractiveness, opportunity score, risk relief, and budget realism.`,
      `Entrepreneurship growth is ${entrepreneurshipGrowth.score}/100 from underserved demand, growth potential, market gaps, and saturation relief.`,
      `Market diversity is ${marketDiversity.score}/100 from category spread, price category evidence, and district coverage.`
    ].join(" "),
    guardrail: "City indicators aggregate current platform analytics only. Trend data is a projected trend from the current analysis and forecast model, not fake historical city statistics."
  };
}

function calculateBusinessActivity({ result, districts, competitors }) {
  const competitorScore = clampScore(competitors.length * 7);
  const trafficScore = averageScore(districts.map((district) => district.footTraffic));
  const priceEvidenceScore = clampScore((result.stats?.sampleCount || 0) * 8);
  const score = clampScore(competitorScore * 0.34 + trafficScore * 0.42 + priceEvidenceScore * 0.24);

  return {
    score,
    label: score >= 72 ? "active" : score >= 48 ? "developing" : "thin evidence",
    drivers: {
      competitorScore,
      trafficScore,
      priceEvidenceScore,
      competitorCount: competitors.length,
      priceSampleCount: result.stats?.sampleCount || 0
    },
    why: `${competitors.length} competitors, ${result.stats?.sampleCount || 0} price samples, and average district traffic ${trafficScore}/100.`
  };
}

function calculateCompetitionDensity({ result, districts, competitors }) {
  const totalDensity = clampScore(competitors.length * 7);
  const averageNearbyCompetitors = districts.length
    ? districts.reduce((sum, district) => sum + Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0), 0) / districts.length
    : 0;
  const nearbyPressure = clampScore(averageNearbyCompetitors * 18);
  const highSaturationShare = districts.length
    ? (districts.filter((district) => district.saturation === "high").length / districts.length) * 100
    : 0;
  const score = clampScore(totalDensity * 0.42 + nearbyPressure * 0.38 + highSaturationShare * 0.2);

  return {
    score,
    label: score >= 70 ? "high density" : score >= 42 ? "moderate density" : "low density",
    drivers: {
      totalCompetitors: competitors.length,
      marketDensity: result.market?.density || "Unknown",
      highSaturationShare: Math.round(highSaturationShare),
      averageNearbyCompetitors: Math.round(averageNearbyCompetitors)
    },
    why: `Density is based on ${competitors.length} competitors, ${result.market?.density || "unknown market density"}, and district saturation.`
  };
}

function calculateInvestmentAttractiveness({ result, districts, proprietaryScores }) {
  const districtScore = averageScore(districts.map((district) => district.opportunityScore ?? district.score));
  const opportunityScore = proprietaryScores.opportunityScore ?? result.opportunityScore?.score ?? 0;
  const riskRelief = clampScore(100 - (proprietaryScores.riskScore ?? result.analyticsEngine?.riskAnalysis?.riskScore ?? 0));
  const budgetRealism = result.budgetPlan?.budgetRealismScore || 0;
  const score = clampScore(districtScore * 0.28 + opportunityScore * 0.28 + riskRelief * 0.22 + budgetRealism * 0.22);

  return {
    score,
    label: score >= 72 ? "investor attractive" : score >= 52 ? "selective investment case" : "risk-heavy investment case",
    drivers: {
      districtScore,
      opportunityScore,
      riskRelief,
      budgetRealism
    },
    why: `Investment attractiveness combines district opportunity ${districtScore}/100, opportunity score ${opportunityScore}/100, risk relief ${riskRelief}/100, and budget realism ${budgetRealism}/100.`
  };
}

function calculateEntrepreneurshipGrowth({ result, districts }) {
  const underservedDemand = averageScore(districts.map((district) => district.underservedScore));
  const growthPotential = result.proprietaryScoring?.scores?.growthPotential ?? result.analyticsEngine?.growthPotential?.topDistrict?.growthScore ?? 0;
  const marketGapScore = result.analyticsEngine?.marketGaps?.strongestGap?.priorityScore ?? result.strategicIntelligence?.marketGapDetection?.[0]?.underservedScore ?? 0;
  const saturationRelief = averageScore(districts.map((district) => {
    if (district.saturation === "low") {
      return 76;
    }

    if (district.saturation === "medium") {
      return 48;
    }

    if (district.saturation === "high") {
      return 18;
    }

    return 35;
  }));
  const score = clampScore(underservedDemand * 0.32 + growthPotential * 0.3 + marketGapScore * 0.2 + saturationRelief * 0.18);

  return {
    score,
    label: score >= 70 ? "strong growth runway" : score >= 48 ? "targeted growth pockets" : "limited visible growth",
    drivers: {
      underservedDemand,
      growthPotential,
      marketGapScore,
      saturationRelief
    },
    why: `Growth is inferred from underserved demand ${underservedDemand}/100, growth potential ${growthPotential}/100, market gap score ${marketGapScore}/100, and saturation relief ${saturationRelief}/100.`
  };
}

function calculateMarketDiversity({ result, categoryStats, competitors }) {
  const uniqueCategories = new Set([
    ...categoryStats.map((category) => category.category),
    ...competitors.map((competitor) => competitor.category).filter(Boolean)
  ]);
  const categoryScore = clampScore(uniqueCategories.size * 18);
  const priceCategoryScore = clampScore((result.pricingIntelligence?.categoryStats?.length || 0) * 18);
  const districtCoverageScore = clampScore((result.districtMetrics?.length || result.opportunityAreas?.length || 0) * 18);
  const score = clampScore(categoryScore * 0.38 + priceCategoryScore * 0.34 + districtCoverageScore * 0.28);

  return {
    score,
    label: score >= 70 ? "diverse market" : score >= 45 ? "moderately diverse market" : "narrow evidence base",
    drivers: {
      uniqueCategoryCount: uniqueCategories.size,
      priceCategoryCount: result.pricingIntelligence?.categoryStats?.length || 0,
      districtCoverage: result.districtMetrics?.length || result.opportunityAreas?.length || 0
    },
    why: `Market diversity uses ${uniqueCategories.size} detected categories, ${result.pricingIntelligence?.categoryStats?.length || 0} price categories, and ${result.districtMetrics?.length || result.opportunityAreas?.length || 0} ranked districts.`
  };
}

function buildCityTrendSeries({ result, businessActivity, competitionDensity, investmentAttractiveness, entrepreneurshipGrowth, marketDiversity, compositeScore }) {
  const projection = result.charts?.profitabilityProjection || [];
  const months = projection.length ? projection.slice(0, 12) : Array.from({ length: 6 }, (_, index) => ({ month: index + 1, netProfit: 0 }));
  const profitValues = months.map((row) => Number(row.netProfit) || 0);
  const maxProfit = Math.max(1, ...profitValues.map((value) => Math.abs(value)));

  return {
    type: "projected",
    source: projection.length ? "profitabilityProjection + city indicator model" : "city indicator model with no profitability projection returned",
    explanation: "Trend points show projected movement from the current analysis. They are not historical city statistics.",
    points: months.map((row, index) => {
      const profitMomentum = clampScore(50 + ((Number(row.netProfit) || 0) / maxProfit) * 38);
      const monthWeight = index / Math.max(1, months.length - 1);
      const growthTrend = clampScore(entrepreneurshipGrowth.score * (0.86 + monthWeight * 0.18));
      const investmentTrend = clampScore(investmentAttractiveness.score * 0.72 + profitMomentum * 0.28);
      const activityTrend = clampScore(businessActivity.score * 0.82 + growthTrend * 0.18);
      const compositeTrend = clampScore(
        activityTrend * 0.2 +
          (100 - competitionDensity.score) * 0.14 +
          investmentTrend * 0.26 +
          growthTrend * 0.22 +
          marketDiversity.score * 0.18
      );

      return {
        month: row.month || index + 1,
        compositeScore: index === 0 ? compositeScore : compositeTrend,
        businessActivity: activityTrend,
        investmentAttractiveness: investmentTrend,
        entrepreneurshipGrowth: growthTrend,
        marketDiversity: marketDiversity.score,
        competitionDensity: competitionDensity.score,
        projectedNetProfit: Number(row.netProfit) || 0
      };
    })
  };
}

function averageScore(values) {
  const numbers = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));

  if (!numbers.length) {
    return 0;
  }

  return clampScore(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

module.exports = {
  buildCityEconomicIndicator
};
