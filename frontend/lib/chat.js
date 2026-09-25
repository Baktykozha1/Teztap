export async function readSseStream(response, onPayload) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const event of events) {
      parseSseEvent(event, onPayload);
    }
  }

  buffer += decoder.decode();

  if (buffer.trim()) {
    parseSseEvent(buffer, onPayload);
  }
}

function parseSseEvent(event, onPayload) {
  const data = event
    .split("\n")
    .filter((item) => item.startsWith("data:"))
    .map((item) => item.slice(5).trimStart())
    .join("\n");

  if (!data) {
    return;
  }

  let payload;

  try {
    payload = JSON.parse(data);
  } catch {
    // Ignore malformed partial SSE frames; the next complete frame can still recover.
    return;
  }

  onPayload(payload);
}

export function compactAnalysisForChat(analysis) {
  if (!analysis) {
    return null;
  }

  return {
    input: analysis.input,
    profile: analysis.profile,
    stats: analysis.stats,
    analytics: analysis.analytics,
    analyticsEngine: analysis.analyticsEngine,
    marketGapEngine: analysis.marketGapEngine,
    proprietaryScoring: analysis.proprietaryScoring,
    opportunityDiscovery: analysis.opportunityDiscovery,
    cityEconomicIndicator: analysis.cityEconomicIndicator,
    investmentModule: analysis.investmentModule,
    propertyMarketplace: analysis.propertyMarketplace,
    projectedMarket: analysis.projectedMarket,
    selectedDecisionContext: analysis.selectedDecisionContext || null,
    ecosystemWorkflows: analysis.ecosystemWorkflows,
    budgetPlan: analysis.budgetPlan,
    market: analysis.market,
    sources: analysis.sources,
    recommendation: analysis.recommendation,
    opportunityScore: analysis.opportunityScore,
    probability: analysis.probability,
    probabilityScores: analysis.probabilityScores,
    districtMetrics: (analysis.districtMetrics || []).slice(0, 8),
    saturationData: analysis.saturationData,
    pricingIntelligence: analysis.pricingIntelligence,
    businessCategoryStats: (analysis.businessCategoryStats || []).slice(0, 8),
    strategicIntelligence: analysis.strategicIntelligence,
    growthInsights: analysis.growthInsights,
    investorDecision: analysis.investorDecision,
    charts: {
      profitabilityProjection: (analysis.charts?.profitabilityProjection || []).slice(0, 12),
      marketSaturation: (analysis.charts?.marketSaturation || []).slice(0, 12),
      districtComparison: (analysis.charts?.districtComparison || []).slice(0, 12)
    },
    opportunityAreas: (analysis.opportunityAreas || []).slice(0, 8),
    competitors: (analysis.competitors || []).slice(0, 16),
    prices: (analysis.prices || []).slice(0, 24)
  };
}
