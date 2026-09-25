function buildMapModel({ competitors, opportunityAreas, fallbackCenter = null }) {
  const points = [
    ...competitors.filter((item) => item.coordinates).map((item) => item.coordinates),
    ...opportunityAreas.filter((item) => item.coordinates).map((item) => item.coordinates)
  ];
  const bounds = calculateBounds(points, fallbackCenter);

  return {
    bounds,
    center: {
      lat: round((bounds.minLat + bounds.maxLat) / 2, 5),
      lng: round((bounds.minLng + bounds.maxLng) / 2, 5)
    },
    markerCount: points.length
  };
}

function calculateBounds(points, fallbackCenter = null) {
  if (!points.length) {
    if (fallbackCenter && Number.isFinite(fallbackCenter.lat) && Number.isFinite(fallbackCenter.lng)) {
      const padding = 0.04;
      return {
        minLat: fallbackCenter.lat - padding,
        maxLat: fallbackCenter.lat + padding,
        minLng: fallbackCenter.lng - padding,
        maxLng: fallbackCenter.lng + padding
      };
    }

    return { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 };
  }

  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const padding = 0.004;

  return {
    minLat: Math.min(...lats) - padding,
    maxLat: Math.max(...lats) + padding,
    minLng: Math.min(...lngs) - padding,
    maxLng: Math.max(...lngs) + padding
  };
}

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

module.exports = {
  buildMapModel,
  calculateBounds
};
