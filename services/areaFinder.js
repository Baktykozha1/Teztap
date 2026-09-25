const crypto = require("node:crypto");
const { getCityConfig, normalizeCityKey } = require("../data/cities");
const { distanceKm, plannedWeight, pressureScore } = require("./projectedMarket");

const AREA_RADIUS_KM = 1.1;
const ANALYSIS_ZONE_SIZE_KM = 2.5;
const MAX_ANALYSIS_AREAS = 200;
const MAX_MAP_COMPETITORS = 250;

const AREA_SCORE_WEIGHTS = Object.freeze({
  existingOpportunity: 0.42,
  competitionSpace: 0.23,
  futurePressureRelief: 0.13,
  propertyFit: 0.12,
  budgetFit: 0.1
});

function buildBestAreaAnalysis({ analysis }) {
  if (!analysis?.input?.city || !analysis?.input?.businessType) {
    throw Object.assign(new Error("A completed market analysis is required"), { status: 400 });
  }

  const discovery = discoverAnalysisAreas({ analysis });
  const sources = collectSources(analysis);
  const businessEvidenceAvailable = hasBusinessEvidence({ analysis, sources });
  const scoredAreas = discovery.areas
    .map((area) => scoreAnalysisArea({ area, analysis, businessEvidenceAvailable }))
    .filter((area) => Number.isFinite(area.score));
  const rankedAreas = selectRankedAreas(scoredAreas).slice(0, 3);
  const generatedAt = new Date().toISOString();
  const status = rankedAreas.length
    ? analysis.budgetPlan?.isBelowMinimum ? "BUDGET_NOT_VIABLE" : "READY"
    : "INSUFFICIENT_AREA_DATA";

  return {
    status,
    generatedAt,
    city: {
      id: discovery.city.id,
      name: discovery.city.name,
      country: discovery.city.country,
      countryCode: discovery.city.countryCode
    },
    business: {
      category: analysis.input.businessType,
      title: analysis.profile?.title || analysis.input.businessType,
      budget: Number(analysis.input.budget),
      targetAudience: analysis.input.targetAudience || null,
      businessFormat: analysis.input.businessFormat || null,
      budgetStatus: analysis.budgetPlan?.isBelowMinimum ? "BUDGET_NOT_VIABLE" : "VIABLE_FOR_SCORING",
      minimumViableBudget: finiteOrNull(analysis.budgetPlan?.minimumViableBudget),
      budgetShortfall: finiteOrNull(analysis.budgetPlan?.budgetShortfall)
    },
    areaDiscovery: {
      source: discovery.source,
      usedGeneratedZones: discovery.usedGeneratedZones,
      discoveredAreaCount: discovery.areas.length,
      message: discovery.message
    },
    rankedAreas,
    analyzedAreas: scoredAreas
      .slice()
      .sort(compareByScore)
      .map(compactArea),
    map: {
      center: analysis.market?.map?.center || discovery.city.center || null,
      bounds: analysis.market?.map?.bounds || null,
      competitors: (analysis.competitors || []).slice(0, MAX_MAP_COMPETITORS).map(mapCompetitor)
    },
    methodology: {
      engine: "TezTap Area Opportunity Aggregator",
      version: "1.0.0",
      comparisonRadiusKm: AREA_RADIUS_KM,
      scoreRange: [0, 100],
      weights: AREA_SCORE_WEIGHTS,
      rules: [
        "The existing TezTap opportunity score is aggregated with area-level evidence.",
        "Competition is compared inside the same fixed radius; raw district totals are not compared as if districts had equal size.",
        "Missing factors are excluded and reduce data coverage; they are never converted to zero.",
        "Planned businesses use the existing projected-market status weights.",
        "An underfunded business cannot receive an area score above the existing budget-constrained opportunity score."
      ]
    },
    sources,
    limitations: buildLimitations({ analysis, discovery, rankedAreas })
  };
}

function discoverAnalysisAreas({ analysis }) {
  const cityConfig = getCityConfig(analysis.input.city);
  const city = {
    id: cityConfig?.id || normalizeCityKey(analysis.input.city),
    name: cityConfig?.name || analysis.input.city,
    country: cityConfig?.country || analysis.input.country || null,
    countryCode: cityConfig?.countryCode || null,
    aliases: cityConfig?.aliases || [],
    center: cityConfig?.center || analysis.market?.map?.center || null
  };
  const namedAreas = dedupeAreas((analysis.opportunityAreas || [])
    .filter((area) => isCoordinate(area?.coordinates) && isSpecificAreaName(area?.name, city))
    .map((area) => normalizeAnalysisArea({ area, city, analysis })));

  if (namedAreas.length) {
    return {
      city,
      areas: namedAreas.slice(0, MAX_ANALYSIS_AREAS),
      source: "OBSERVED_NAMED_AREAS",
      usedGeneratedZones: false,
      message: "Named sub-city areas were normalized from live business records."
    };
  }

  const zones = buildAnalysisZones({ city, competitors: analysis.competitors || [], analysis });
  return {
    city,
    areas: zones,
    source: zones.length ? "GENERATED_ANALYSIS_ZONES" : "INSUFFICIENT_AREA_DATA",
    usedGeneratedZones: zones.length > 0,
    message: zones.length
      ? "Official neighborhood boundaries were unavailable. TezTap is using coordinate-based analysis zones, not named neighborhoods."
      : "No trustworthy sub-city areas or geocoded business records were available."
  };
}

function normalizeAnalysisArea({ area, city, analysis }) {
  const type = inferAreaType(area.name, area.type);
  return {
    id: area.id || stableAreaId([city.id, type, area.name]),
    cityId: city.id,
    countryCode: city.countryCode,
    name: String(area.name).trim(),
    type,
    geometry: area.geometry || null,
    centroid: { lat: Number(area.coordinates.lat), lng: Number(area.coordinates.lng) },
    source: area.source || analysis.market?.districtCoverage?.source || "live-observed",
    sourceId: area.sourceId || null,
    dataQuality: finiteOrNull(area.signalCoverage) != null ? coverageLevel(area.signalCoverage) : "MEDIUM",
    updatedAt: latestSourceTimestamp(analysis.sources) || analysis.meta?.generatedAt || null,
    existingScore: finiteOrNull(area.score),
    sourceArea: area
  };
}

function buildAnalysisZones({ city, competitors, analysis }) {
  const points = competitors.filter((item) => isCoordinate(item?.coordinates));
  if (!points.length) return [];
  const center = city.center || averageCoordinates(points.map((item) => item.coordinates));
  if (!center) return [];
  const latStep = ANALYSIS_ZONE_SIZE_KM / 111.32;
  const lngStep = ANALYSIS_ZONE_SIZE_KM / Math.max(1, 111.32 * Math.cos(toRadians(center.lat)));
  const groups = new Map();

  for (const competitor of points) {
    const row = Math.floor((competitor.coordinates.lat - center.lat) / latStep);
    const column = Math.floor((competitor.coordinates.lng - center.lng) / lngStep);
    const key = `${row}:${column}`;
    const current = groups.get(key) || { row, column, points: [] };
    current.points.push(competitor.coordinates);
    groups.set(key, current);
  }

  return Array.from(groups.values())
    .sort((left, right) => left.row - right.row || left.column - right.column)
    .slice(0, MAX_ANALYSIS_AREAS)
    .map((group, index) => ({
      id: stableAreaId([city.id, "CUSTOM_ZONE", group.row, group.column]),
      cityId: city.id,
      countryCode: city.countryCode,
      name: `Analysis zone ${index + 1}`,
      type: "CUSTOM_ZONE",
      geometry: null,
      centroid: averageCoordinates(group.points),
      source: "generated_from_live_business_coordinates",
      sourceId: `${group.row}:${group.column}`,
      dataQuality: "LOW",
      updatedAt: latestSourceTimestamp(analysis.sources) || analysis.meta?.generatedAt || null,
      existingScore: null,
      sourceArea: null
    }));
}

function scoreAnalysisArea({ area, analysis, businessEvidenceAvailable }) {
  const competitors = businessEvidenceAvailable
    ? (analysis.competitors || []).filter((item) => isCoordinate(item?.coordinates) && distanceKm(area.centroid, item.coordinates) <= AREA_RADIUS_KM)
    : null;
  const currentCompetitors = competitors ? competitors.length : null;
  const competitionSpace = currentCompetitors == null ? null : clampScore(100 - currentCompetitors * 18);
  const activePlans = Array.isArray(analysis.plannedBusinesses)
    ? analysis.plannedBusinesses.filter((item) => item.status !== "CANCELLED" && sameCategory(item.category, analysis.input.businessType))
    : null;
  const nearbyPlans = activePlans?.filter((item) => matchesAreaOrRadius(item, area, AREA_RADIUS_KM)) || null;
  const weightedPlans = nearbyPlans == null ? null : round(nearbyPlans.reduce((sum, item) => sum + plannedWeight(item.status), 0), 2);
  const futurePressure = currentCompetitors == null || weightedPlans == null
    ? null
    : pressureScore(currentCompetitors + weightedPlans, currentCompetitors);
  const properties = areaProperties({ area, analysis });
  const propertyScores = properties.map((item) => Number(item.propertyFitScore)).filter(Number.isFinite);
  const propertyFit = propertyScores.length ? Math.max(...propertyScores) : null;
  const budgetFit = finiteOrNull(analysis.budgetPlan?.budgetRealismScore);
  const existingOpportunity = finiteOrNull(area.existingScore);
  const signals = [
    signal("existingOpportunity", existingOpportunity),
    signal("competitionSpace", competitionSpace),
    signal("futurePressureRelief", futurePressure == null ? null : 100 - futurePressure),
    signal("propertyFit", propertyFit),
    signal("budgetFit", budgetFit)
  ].filter(Boolean);
  const availableWeight = signals.reduce((sum, item) => sum + item.weight, 0);
  let score = availableWeight
    ? clampScore(signals.reduce((sum, item) => sum + item.value * item.weight, 0) / availableWeight)
    : null;
  if (score != null && analysis.budgetPlan?.isBelowMinimum) {
    const globalBudgetConstrainedScore = finiteOrNull(analysis.opportunityScore?.score);
    score = Math.min(score, globalBudgetConstrainedScore ?? budgetFit ?? score);
  }
  const coverage = Math.round(availableWeight * 100);
  const confidence = buildConfidence({ coverage, currentCompetitors, area, propertyCount: properties.length, plannedCount: nearbyPlans?.length });
  const saturation = currentCompetitors == null ? null : currentCompetitors >= 5 ? "HIGH" : currentCompetitors >= 3 ? "MEDIUM" : "LOW";
  const factors = {
    existingOpportunity,
    competition: currentCompetitors == null ? null : { score: competitionSpace, nearbyCompetitors: currentCompetitors, radiusKm: AREA_RADIUS_KM },
    saturation: saturation == null ? null : { level: saturation, nearbyCompetitors: currentCompetitors },
    demographicFit: null,
    futureMarketPressure: futurePressure == null ? null : {
      score: futurePressure,
      plannedCompetitors: nearbyPlans.length,
      weightedPlannedCompetitors: weightedPlans
    },
    propertyFit: propertyFit == null ? null : { score: round(propertyFit, 0), availableProperties: properties.length },
    budgetFit: budgetFit == null ? null : {
      score: budgetFit,
      status: analysis.budgetPlan?.isBelowMinimum ? "BUDGET_NOT_VIABLE" : "VIABLE_FOR_SCORING",
      minimumViableBudget: finiteOrNull(analysis.budgetPlan?.minimumViableBudget),
      shortfall: finiteOrNull(analysis.budgetPlan?.budgetShortfall)
    }
  };
  const missingData = Object.entries(factors).filter(([, value]) => value == null).map(([key]) => missingDataCode(key));

  return {
    areaId: area.id,
    name: area.name,
    areaType: area.type,
    geometry: area.geometry,
    centroid: area.centroid,
    score,
    confidence,
    factors,
    strengths: buildStrengths({ factors, analysis }),
    risks: buildRisks({ factors, analysis, confidence }),
    missingData,
    sources: buildAreaSources({ area, analysis, properties, nearbyPlans }),
    properties: properties.slice(0, 3).map(publicProperty),
    source: area.source,
    dataQuality: area.dataQuality,
    updatedAt: area.updatedAt
  };
}

function selectRankedAreas(areas) {
  const remaining = areas.slice().sort(compareByScore);
  if (!remaining.length) return [];
  const selected = [{ ...remaining.shift(), resultType: "BEST_OVERALL" }];
  const bestCompetition = selected[0].factors.competition?.nearbyCompetitors;
  const lowerCompetitionIndex = remaining
    .map((area, index) => ({ area, index }))
    .filter(({ area }) => Number.isFinite(area.factors.competition?.nearbyCompetitors))
    .sort((left, right) =>
      left.area.factors.competition.nearbyCompetitors - right.area.factors.competition.nearbyCompetitors ||
      compareByScore(left.area, right.area)
    )[0];

  if (lowerCompetitionIndex && (!Number.isFinite(bestCompetition) || lowerCompetitionIndex.area.factors.competition.nearbyCompetitors < bestCompetition)) {
    selected.push({ ...remaining.splice(lowerCompetitionIndex.index, 1)[0], resultType: "LOWER_COMPETITION" });
  }
  while (selected.length < 3 && remaining.length) {
    selected.push({ ...remaining.shift(), resultType: "ALTERNATIVE_OPPORTUNITY" });
  }
  return selected.map((area, index) => ({ ...area, rank: index + 1 }));
}

function buildStrengths({ factors, analysis }) {
  const strengths = [];
  if (factors.existingOpportunity >= 65) strengths.push({ code: "EXISTING_OPPORTUNITY", message: `Existing opportunity analytics contributes ${Math.round(factors.existingOpportunity)}/100.` });
  if (factors.competition?.score >= 65) strengths.push({ code: "LOWER_COMPETITION", message: `${factors.competition.nearbyCompetitors} relevant competitors were found within ${factors.competition.radiusKm} km.` });
  if (factors.futureMarketPressure?.score <= 35) strengths.push({ code: "CONTROLLED_FUTURE_PRESSURE", message: `Future market pressure is ${factors.futureMarketPressure.score}/100 from ${factors.futureMarketPressure.plannedCompetitors} nearby plans.` });
  if (factors.propertyFit?.score >= 60) strengths.push({ code: "PROPERTY_FIT", message: `${factors.propertyFit.availableProperties} verified properties are available; the strongest fit is ${factors.propertyFit.score}/100.` });
  if (factors.budgetFit?.score >= 70) strengths.push({ code: "BUDGET_FIT", message: `Budget realism is ${Math.round(factors.budgetFit.score)}/100 for ${analysis.profile?.title || analysis.input.businessType}.` });
  return strengths.slice(0, 4);
}

function buildRisks({ factors, analysis, confidence }) {
  const risks = [];
  if (factors.competition?.score < 45) risks.push({ code: "HIGH_COMPETITION", message: `${factors.competition.nearbyCompetitors} relevant competitors are located within ${factors.competition.radiusKm} km.` });
  if (factors.futureMarketPressure?.score >= 55) risks.push({ code: "FUTURE_PRESSURE", message: `${factors.futureMarketPressure.plannedCompetitors} planned businesses raise future market pressure to ${factors.futureMarketPressure.score}/100.` });
  if (analysis.budgetPlan?.isBelowMinimum) risks.push({ code: "BUDGET_NOT_VIABLE", message: `The budget is ${analysis.budgetPlan.budgetShortfall} KZT below the known minimum viable budget.` });
  if (confidence.level === "LOW") risks.push({ code: "LIMITED_DATA", message: `Only ${confidence.coverage}% of configured scoring evidence is available for this area.` });
  return risks.slice(0, 4);
}

function buildConfidence({ coverage, currentCompetitors, area, propertyCount, plannedCount }) {
  const evidenceRecords = (currentCompetitors || 0) + (propertyCount || 0) + (plannedCount || 0);
  const level = coverage >= 80 && evidenceRecords >= 3 && area.type !== "CUSTOM_ZONE"
    ? "HIGH"
    : coverage >= 55 && evidenceRecords >= 1 ? "MEDIUM" : "LOW";
  return { level, coverage, evidenceRecords };
}

function areaProperties({ area, analysis }) {
  return (analysis.propertyMarketplace?.properties || [])
    .filter((property) => isCoordinate(property?.coordinates) && matchesAreaOrRadius(property, area, AREA_RADIUS_KM))
    .sort((left, right) => Number(right.propertyFitScore || 0) - Number(left.propertyFitScore || 0));
}

function matchesAreaOrRadius(item, area, radiusKm) {
  const district = item.districtId || item.district || item.area;
  if (district && normalizeCityKey(district) === normalizeCityKey(area.name)) return true;
  const coordinates = item.coordinates || (Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))
    ? { lat: Number(item.latitude), lng: Number(item.longitude) }
    : null);
  return isCoordinate(coordinates) && distanceKm(area.centroid, coordinates) <= radiusKm;
}

function hasBusinessEvidence({ analysis, sources }) {
  if ((analysis.competitors || []).some((item) => item.sourceName || item.liveSource)) return true;
  return sources.some((source) => source.kind === "BUSINESS" && ["LIVE", "PARTIAL", "CACHE", "READY"].includes(source.status));
}

function collectSources(analysis) {
  const providers = Object.values(analysis.sources?.businesses || {}).filter((value) => value && typeof value === "object");
  const sources = providers.map((source) => ({
    kind: "BUSINESS",
    name: source.name || source.provider || "Market business provider",
    status: String(source.status || "UNKNOWN").toUpperCase(),
    records: finiteOrNull(source.count),
    fetchedAt: source.fetchedAt || null
  }));
  if (Array.isArray(analysis.plannedBusinesses)) sources.push({ kind: "PLANNED_BUSINESS", name: "TezTap planned-business model", status: "READY", records: analysis.plannedBusinesses.length, fetchedAt: analysis.meta?.generatedAt || null });
  if (analysis.propertyMarketplace) sources.push({ kind: "COMMERCIAL_PROPERTY", name: "TezTap verified property marketplace", status: analysis.propertyMarketplace.source === "verified_property_listings" ? "READY" : "EMPTY", records: analysis.propertyMarketplace.properties?.length || 0, fetchedAt: analysis.meta?.generatedAt || null });
  return sources;
}

function buildAreaSources({ area, analysis, properties, nearbyPlans }) {
  return [
    { kind: "AREA", name: area.source, updatedAt: area.updatedAt },
    { kind: "BUSINESS", records: (analysis.competitors || []).length, updatedAt: latestSourceTimestamp(analysis.sources) },
    ...(nearbyPlans == null ? [] : [{ kind: "PLANNED_BUSINESS", records: nearbyPlans.length, updatedAt: analysis.meta?.generatedAt || null }]),
    ...(analysis.propertyMarketplace ? [{ kind: "COMMERCIAL_PROPERTY", records: properties.length, updatedAt: analysis.meta?.generatedAt || null }] : [])
  ];
}

function buildLimitations({ analysis, discovery, rankedAreas }) {
  const limitations = [];
  if (discovery.usedGeneratedZones) limitations.push("Named neighborhood boundaries were unavailable; results use coordinate-based analysis zones.");
  if (!analysis.propertyMarketplace?.properties?.length) limitations.push("No verified commercial-property listings were available for property fit.");
  limitations.push("Demographic fit is unavailable because no verified demographic provider is connected to this analysis.");
  if (!rankedAreas.length) limitations.push("There was not enough area-level evidence to produce a ranking.");
  return limitations;
}

function publicProperty(property) {
  return {
    id: property.id,
    title: property.title,
    transactionType: property.transactionType,
    price: finiteOrNull(property.price),
    currency: property.currency || "KZT",
    areaSqm: finiteOrNull(property.areaSqm),
    address: property.address || null,
    districtId: property.districtId || null,
    coordinates: property.coordinates || null,
    propertyFitScore: finiteOrNull(property.propertyFitScore),
    distanceKm: finiteOrNull(property.distanceKm),
    fitExplanation: property.fitExplanation || null
  };
}

function compactArea(area) {
  return {
    areaId: area.areaId,
    name: area.name,
    areaType: area.areaType,
    centroid: area.centroid,
    score: area.score,
    confidence: area.confidence,
    competition: area.factors.competition,
    saturation: area.factors.saturation,
    futureMarketPressure: area.factors.futureMarketPressure
  };
}

function mapCompetitor(item) {
  return {
    id: item.id,
    name: item.name,
    address: item.address || null,
    area: item.area || null,
    category: item.category || null,
    coordinates: item.coordinates,
    sourceName: item.sourceName || null,
    sourceUrl: item.sourceUrl || null
  };
}

function signal(key, value) {
  return Number.isFinite(value) ? { key, value, weight: AREA_SCORE_WEIGHTS[key] } : null;
}

function inferAreaType(name, suppliedType) {
  const supplied = String(suppliedType || "").trim().toUpperCase();
  if (["DISTRICT", "NEIGHBORHOOD", "MICRODISTRICT", "WARD", "BOROUGH", "ADMIN_AREA", "CUSTOM_ZONE"].includes(supplied)) return supplied;
  const normalized = normalizeCityKey(name);
  if (/microdistrict|микрорайон|мкр|шағынаудан/.test(normalized)) return "MICRODISTRICT";
  if (/neighbou?rhood|квартал/.test(normalized)) return "NEIGHBORHOOD";
  if (/ward/.test(normalized)) return "WARD";
  if (/borough/.test(normalized)) return "BOROUGH";
  if (/district|район|аудан/.test(normalized)) return "DISTRICT";
  return "ADMIN_AREA";
}

function isSpecificAreaName(name, city) {
  const normalized = normalizeCityKey(name);
  if (!normalized) return false;
  return !new Set([city.id, city.name, city.country, ...(city.aliases || []), "Kazakhstan", "Казахстан", "Қазақстан"].filter(Boolean).map(normalizeCityKey)).has(normalized);
}

function dedupeAreas(areas) {
  const seen = new Set();
  return areas.filter((area) => {
    const key = `${normalizeCityKey(area.name)}:${round(area.centroid.lat, 4)}:${round(area.centroid.lng, 4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareByScore(left, right) {
  return Number(right.score) - Number(left.score) || left.name.localeCompare(right.name);
}

function missingDataCode(key) {
  return ({ existingOpportunity: "EXISTING_OPPORTUNITY", competition: "COMPETITION", saturation: "SATURATION", demographicFit: "DEMOGRAPHICS", futureMarketPressure: "FUTURE_MARKET_PRESSURE", propertyFit: "COMMERCIAL_PROPERTIES", budgetFit: "BUDGET" })[key] || key.toUpperCase();
}

function coverageLevel(value) {
  const number = Number(value);
  return number >= 75 ? "HIGH" : number >= 45 ? "MEDIUM" : "LOW";
}

function stableAreaId(parts) {
  return crypto.createHash("sha1").update(parts.join("|").toLowerCase()).digest("hex").slice(0, 24);
}

function latestSourceTimestamp(sources) {
  const timestamps = Object.values(sources?.businesses || {})
    .map((source) => Date.parse(source?.fetchedAt || source?.updatedAt || ""))
    .filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

function averageCoordinates(points) {
  if (!points.length) return null;
  return {
    lat: round(points.reduce((sum, point) => sum + Number(point.lat), 0) / points.length, 6),
    lng: round(points.reduce((sum, point) => sum + Number(point.lng), 0) / points.length, 6)
  };
}

function isCoordinate(value) {
  return Number.isFinite(Number(value?.lat)) && Number.isFinite(Number(value?.lng));
}

function sameCategory(left, right) {
  if (!left || !right) return false;
  return normalizeCityKey(left) === normalizeCityKey(right);
}

function finiteOrNull(value) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(number) ? number : null;
}

function clampScore(value) {
  return round(Math.max(0, Math.min(100, Number(value))), 0);
}

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round(Number(value) * factor) / factor;
}

function toRadians(value) {
  return Number(value) * Math.PI / 180;
}

module.exports = {
  AREA_RADIUS_KM,
  AREA_SCORE_WEIGHTS,
  buildBestAreaAnalysis,
  discoverAnalysisAreas,
  scoreAnalysisArea,
  selectRankedAreas
};
