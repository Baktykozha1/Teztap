const { getCityConfig, normalizeCityKey } = require("../data/cities");

function resolveOpportunityAreas({ city, competitors }) {
  const observedAreas = deriveObservedAreas({ city, competitors });
  return { areas: observedAreas, source: "live-observed", observedAreaCount: observedAreas.length };
}

function deriveObservedAreas({ city, competitors }) {
  const cityConfig = getCityConfig(city);
  const excludedAreaKeys = new Set([cityConfig?.id, cityConfig?.name, city, cityConfig?.country, "Kazakhstan", "Казахстан", "Қазақстан"]
    .filter(Boolean)
    .map(normalizeCityKey));
  const groupedAreas = new Map();

  for (const competitor of competitors || []) {
    const name = String(competitor?.area || "").trim();
    const coordinates = competitor?.coordinates;

    if (!name || excludedAreaKeys.has(normalizeCityKey(name)) || !isCoordinate(coordinates)) {
      continue;
    }

    const current = groupedAreas.get(name) || { name, latTotal: 0, lngTotal: 0, count: 0 };
    current.latTotal += coordinates.lat;
    current.lngTotal += coordinates.lng;
    current.count += 1;
    groupedAreas.set(name, current);
  }

  return Array.from(groupedAreas.values())
    .map((area) => ({
      name: area.name,
      coordinates: {
        lat: round(area.latTotal / area.count, 6),
        lng: round(area.lngTotal / area.count, 6)
      },
      anchors: [],
      footTraffic: null,
      rentIndex: null,
      observedCompetitorCount: area.count,
      observedOnly: true
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function isCoordinate(value) {
  return Number.isFinite(value?.lat) && Number.isFinite(value?.lng);
}

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

module.exports = {
  resolveOpportunityAreas,
  deriveObservedAreas
};
