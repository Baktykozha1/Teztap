const city = { id: "aktau", type: "city", parentId: null, name: "Актау", address: "Актау, Казахстан", coordinates: { lat: 43.6532, lng: 51.1975 }, source: "openstreetmap", sourceLabel: "OpenStreetMap · центр города", verificationStatus: "open-data-unverified", demo: false };

// Approximate MVP locations. They must never be shown as verified addresses.
const demoLocations = [
  { id: "demo-md-14", type: "microdistrict", parentId: "aktau", name: "14-й микрорайон · демо", address: "14-й микрорайон, Актау · примерная точка", coordinates: { lat: 43.6514, lng: 51.1571 } },
  { id: "demo-md-15", type: "microdistrict", parentId: "aktau", name: "15-й микрорайон · демо", address: "15-й микрорайон, Актау · примерная точка", coordinates: { lat: 43.6518, lng: 51.1652 } },
  { id: "demo-md-17", type: "microdistrict", parentId: "aktau", name: "17-й микрорайон · демо", address: "17-й микрорайон, Актау · примерная точка", coordinates: { lat: 43.6601, lng: 51.1754 } },
  { id: "demo-complex-14", type: "complex", parentId: "demo-md-14", name: "ЖК «Каспийский двор» · демо", address: "14-й микрорайон · примерная точка", coordinates: { lat: 43.6520, lng: 51.1580 } },
  { id: "demo-building-14-1", type: "building", parentId: "demo-complex-14", name: "Корпус 1 · демо", address: "ЖК «Каспийский двор» · примерная точка", coordinates: { lat: 43.6522, lng: 51.1584 } },
  { id: "demo-building-14-2", type: "building", parentId: "demo-complex-14", name: "Корпус 2 · демо", address: "ЖК «Каспийский двор» · примерная точка", coordinates: { lat: 43.6518, lng: 51.1576 } },
  { id: "demo-building-15-1", type: "building", parentId: "demo-md-15", name: "Дом 1 · демо", address: "15-й микрорайон · примерная точка", coordinates: { lat: 43.6517, lng: 51.1648 } }
].map((location) => ({ ...location, source: "demo", sourceLabel: "Демонстрационные данные MVP · адрес не проверен", verificationStatus: "demo", demo: true }));

const announcementCategories = ["water", "electricity", "heating", "gas", "internet", "elevator", "road", "cleaning", "other"];
const announcementStatuses = ["planned", "ongoing", "resolved", "cancelled"];
const locationTypes = ["microdistrict", "complex", "building"];

function lineage(id, byId) {
  const chain = [];
  const seen = new Set();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    chain.push(current.id);
    seen.add(current.id);
    current = byId.get(current.parentId);
  }
  return chain;
}

function isWithinScope(scopeId, locationId, byId) {
  return lineage(locationId, byId).includes(scopeId);
}

function affectsLocation(affectedIds, locationId, byId) {
  const parents = lineage(locationId, byId);
  return affectedIds.some((id) => parents.includes(id));
}

function affectedMembership(member, affectedIds, byId, category) {
  const categoryEnabled = !category || !Array.isArray(member.notificationCategories) || member.notificationCategories.includes(category);
  return member.notificationsEnabled !== false && categoryEnabled && (
    affectedIds.some((id) => isWithinScope(id, member.locationId, byId)) ||
    Boolean(member.primaryHome && affectedIds.some((id) => isWithinScope(id, member.primaryHome, byId)))
  );
}

module.exports = { city, demoLocations, announcementCategories, announcementStatuses, locationTypes, lineage, isWithinScope, affectsLocation, affectedMembership };
