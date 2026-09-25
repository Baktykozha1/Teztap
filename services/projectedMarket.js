const PLANNED_COMPETITION_WEIGHTS = {
  PLANNED: 0.35,
  VERIFIED: 0.75,
  OPEN: 1,
  CANCELLED: 0
};

const DEFAULT_RADIUS_KM = 0.5;

function buildProjectedMarketModel({ analysis, plannedBusinesses = [], radiusKm = DEFAULT_RADIUS_KM }) {
  const activePlans = plannedBusinesses.filter((item) => item.status !== "CANCELLED");
  const sameCategoryPlans = activePlans.filter((item) => sameCategory(item.category, analysis?.input?.businessType));
  const existingCompetitors = Number(analysis?.market?.competitorCount || analysis?.competitors?.length || 0);
  const plannedCompetitors = sameCategoryPlans.filter((item) => item.status === "PLANNED").length;
  const verifiedCompetitors = sameCategoryPlans.filter((item) => item.status === "VERIFIED").length;
  const openCompetitors = sameCategoryPlans.filter((item) => item.status === "OPEN").length;
  const weightedFutureCompetitors = sameCategoryPlans.reduce((sum, item) => sum + plannedWeight(item.status), 0);
  const currentCompetitionScore = pressureScore(existingCompetitors, existingCompetitors);
  const futureMarketPressure = pressureScore(existingCompetitors + weightedFutureCompetitors, existingCompetitors);
  const projectedOpportunityScore = projectedScore(analysis?.opportunityScore?.score, futureMarketPressure - currentCompetitionScore);
  const currentRisk = Number(analysis?.proprietaryScoring?.scores?.riskScore || analysis?.analyticsEngine?.riskAnalysis?.riskScore || 0);
  const projectedRisk = clamp(Math.round(currentRisk + (futureMarketPressure - currentCompetitionScore) * 0.45), 0, 100);
  const districtImpacts = buildDistrictImpacts({ analysis, plans: sameCategoryPlans, radiusKm });
  const congestion = detectOpportunityCongestion({ plans: sameCategoryPlans, radiusKm });
  const alternativeOpportunity = findAlternativeOpportunity({ analysis, districtImpacts });

  return {
    weights: PLANNED_COMPETITION_WEIGHTS,
    radiusKm,
    existingCompetitors,
    plannedCompetitors,
    verifiedCompetitors,
    openCompetitors,
    projectedCompetitors: existingCompetitors + plannedCompetitors + verifiedCompetitors + openCompetitors,
    weightedFutureCompetitors: round(weightedFutureCompetitors, 2),
    currentCompetitionScore,
    futureMarketPressure,
    currentOpportunityScore: Number(analysis?.opportunityScore?.score || 0),
    projectedOpportunityScore,
    currentRisk,
    projectedRisk,
    pressureDelta: futureMarketPressure - currentCompetitionScore,
    districtImpacts,
    congestion,
    alternativeOpportunity,
    timeline: buildMarketTimeline({ existingCompetitors, plannedCompetitors, verifiedCompetitors, openCompetitors }),
    explanation: buildPressureExplanation({ plannedCompetitors, verifiedCompetitors, openCompetitors, futureMarketPressure })
  };
}

function buildDistrictImpacts({ analysis, plans, radiusKm }) {
  return (analysis?.districtMetrics || analysis?.opportunityAreas || []).map((district) => {
    const districtName = district.district || district.name;
    const nearbyPlans = plans.filter((plan) =>
      sameDistrict(plan.districtId, districtName)
      || (plan.coordinates && district.coordinates && distanceKm(plan.coordinates, district.coordinates) <= radiusKm)
    );
    const weightedPlans = nearbyPlans.reduce((sum, item) => sum + plannedWeight(item.status), 0);
    const pressure = pressureScore(Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0) + weightedPlans, Number(district.nearbyCompetitors ?? district.competitorCountNearby ?? 0));
    const projectedOpportunityScore = projectedScore(district.opportunityScore ?? district.score, pressure * 0.35);

    return {
      district: districtName,
      currentOpportunityScore: Number(district.opportunityScore ?? district.score ?? 0),
      projectedOpportunityScore,
      plannedNearby: nearbyPlans.length,
      weightedPlannedNearby: round(weightedPlans, 2),
      futureMarketPressure: pressure,
      plannedStatuses: countStatuses(nearbyPlans)
    };
  }).sort((left, right) => right.futureMarketPressure - left.futureMarketPressure);
}

function detectOpportunityCongestion({ plans, radiusKm }) {
  const congested = [];

  for (const plan of plans) {
    const nearby = plans.filter((candidate) =>
      candidate.id !== plan.id
      && candidate.coordinates
      && plan.coordinates
      && distanceKm(plan.coordinates, candidate.coordinates) <= radiusKm
    );

    if (nearby.length >= 2) {
      congested.push({
        category: plan.category,
        district: plan.districtId || "nearby area",
        nearbyPlannedBusinesses: nearby.length + 1,
        radiusKm,
        warning: "Opportunity congestion detected"
      });
    }
  }

  return dedupeBy(congested, (item) => `${item.category}:${item.district}`).slice(0, 5);
}

function findAlternativeOpportunity({ analysis, districtImpacts }) {
  const impactedDistricts = new Map(districtImpacts.map((item) => [item.district, item]));
  const currentDistrict = analysis?.recommendation?.bestArea || analysis?.opportunityScore?.bestDistrict;
  const alternatives = (analysis?.districtMetrics || analysis?.opportunityAreas || [])
    .filter((district) => (district.district || district.name) !== currentDistrict)
    .map((district) => {
      const name = district.district || district.name;
      const impact = impactedDistricts.get(name);
      return {
        district: name,
        currentOpportunityScore: Number(district.opportunityScore ?? district.score ?? 0),
        projectedOpportunityScore: impact?.projectedOpportunityScore ?? Number(district.opportunityScore ?? district.score ?? 0),
        futureMarketPressure: impact?.futureMarketPressure ?? 0,
        plannedNearby: impact?.plannedNearby ?? 0
      };
    })
    .sort((left, right) => right.projectedOpportunityScore - left.projectedOpportunityScore);

  return alternatives[0] || null;
}

function buildMarketTimeline({ existingCompetitors, plannedCompetitors, verifiedCompetitors, openCompetitors }) {
  return [
    { stage: "TODAY", label: "Existing businesses", competitors: existingCompetitors },
    { stage: "PLANNED", label: "Planned businesses", competitors: plannedCompetitors + verifiedCompetitors },
    { stage: "PROJECTED", label: "Projected competitors", competitors: existingCompetitors + plannedCompetitors + verifiedCompetitors + openCompetitors }
  ];
}

function buildPressureExplanation({ plannedCompetitors, verifiedCompetitors, openCompetitors, futureMarketPressure }) {
  const plannedTotal = plannedCompetitors + verifiedCompetitors + openCompetitors;
  if (!plannedTotal) {
    return "No planned same-category businesses are currently affecting future market pressure.";
  }

  return `Future market pressure is ${futureMarketPressure}/100 because ${plannedTotal} same-category planned or transitioning businesses are present in the market model.`;
}

function sameCategory(left, right) {
  if (!left || !right) return false;
  return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

function sameDistrict(left, right) {
  if (!left || !right) return false;
  return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

function plannedWeight(status) {
  return PLANNED_COMPETITION_WEIGHTS[String(status || "PLANNED").toUpperCase()] ?? PLANNED_COMPETITION_WEIGHTS.PLANNED;
}

function pressureScore(projectedCount, existingCount) {
  const base = Math.min(100, projectedCount * 8);
  const increase = existingCount > 0 ? ((projectedCount - existingCount) / existingCount) * 45 : projectedCount * 12;
  return clamp(Math.round(base + increase), 0, 100);
}

function projectedScore(score, pressureDelta) {
  return clamp(Math.round(Number(score || 0) - Math.max(0, pressureDelta) * 0.42), 0, 100);
}

function countStatuses(items) {
  return items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
}

function distanceKm(left, right) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(Number(right.lat) - Number(left.lat));
  const dLng = toRadians(Number(right.lng) - Number(left.lng));
  const lat1 = toRadians(Number(left.lat));
  const lat2 = toRadians(Number(right.lat));
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function dedupeBy(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = {
  PLANNED_COMPETITION_WEIGHTS,
  buildProjectedMarketModel,
  distanceKm,
  plannedWeight,
  pressureScore
};
