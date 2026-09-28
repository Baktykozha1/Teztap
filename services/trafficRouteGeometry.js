function extractTrafficRouteGeometry(result) {
  if (!result || typeof result !== "object") return [];
  const maneuvers = Array.isArray(result.maneuvers)
    ? result.maneuvers
    : Object.values(result.maneuvers || {});
  const geometryParts = [
    result.begin_pedestrian_path?.geometry,
    ...maneuvers.map((maneuver) => maneuver?.outcoming_path?.geometry),
    result.end_pedestrian_path?.geometry
  ];
  const segments = geometryParts.flatMap(readSegments).filter(({ selection }) => /^LINESTRING\s*\(/i.test(selection.trim()));
  return segments.filter((segment, index) => segments.findIndex((candidate) => candidate.selection === segment.selection) === index);
}

function readSegments(value, inherited = {}) {
  if (typeof value === "string") return [{ selection: value, ...inherited }];
  if (Array.isArray(value)) return value.flatMap((entry) => readSegments(entry, inherited));
  if (!value || typeof value !== "object") return [];
  const metadata = {
    color: typeof value.color === "string" ? value.color : inherited.color,
    length: Number.isFinite(Number(value.length)) ? Number(value.length) : inherited.length,
    style: typeof value.style === "string" ? value.style : inherited.style
  };
  if (typeof value.selection === "string") return [{ selection: value.selection, ...metadata }];
  return Object.values(value).flatMap((entry) => readSegments(entry, metadata));
}

function extractTrafficWaypoints(result) {
  const waypoints = Array.isArray(result?.waypoints)
    ? result.waypoints
    : Object.values(result?.waypoints || {});
  return waypoints.map((waypoint) => {
    const point = waypoint?.projected_point || waypoint?.original_point;
    const lat = Number(point?.lat);
    const lng = Number(point?.lon ?? point?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat, lng }
      : null;
  }).filter(Boolean);
}

module.exports = { extractTrafficRouteGeometry, extractTrafficWaypoints };
