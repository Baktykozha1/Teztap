const {
  createCommercialProperty,
  listCommercialProperties,
  getCommercialProperty,
  updateCommercialProperty,
  countCommercialProperties
} = require("./database");

const PUBLIC_PROPERTY_STATUSES = ["ACTIVE", "VERIFIED"];
const OWNER_PROPERTY_LIMIT = Number(process.env.PROPERTY_OWNER_DAILY_LIMIT || 20);
const DEFAULT_RADIUS_KM = Number(process.env.PROPERTY_SEARCH_RADIUS_KM || 5);

async function listPublicProperties(filters = {}) {
  const records = await listCommercialProperties({
    ...filters,
    status: PUBLIC_PROPERTY_STATUSES,
    includePrivate: false,
    limit: filters.limit || 120
  });
  return records.map((property) => ({ ...property, contactPhone: undefined, contactEmail: undefined, ownerId: undefined }));
}

async function createOwnerProperty({ user, payload }) {
  requireUser(user);
  const property = validatePropertyPayload(payload);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const submittedToday = await countCommercialProperties({ ownerId: user.id, since });
  if (submittedToday >= OWNER_PROPERTY_LIMIT) {
    const error = new Error("Daily property submission limit reached.");
    error.status = 429;
    throw error;
  }
  return createCommercialProperty({ ownerId: user.id, property: { ...property, status: "PENDING", source: property.source || "user_submitted" } });
}

async function updateOwnerProperty({ user, id, payload }) {
  requireUser(user);
  if (["ACTIVE", "VERIFIED", "REJECTED"].includes(String(payload.status || "").toUpperCase())) {
    const error = new Error("Only an authorized moderator can change listing verification status.");
    error.status = 403;
    throw error;
  }
  const updates = validatePropertyPatch(payload);
  const property = await updateCommercialProperty({ id, ownerId: user.id, updates });
  if (!property) {
    const error = new Error("Commercial property not found");
    error.status = 404;
    throw error;
  }
  return property;
}

async function moderateProperty({ user, id, status }) {
  requireUser(user);
  const moderators = String(process.env.PROPERTY_MODERATOR_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (user.role !== "ADMIN" && !moderators.includes(String(user.email || "").toLowerCase())) {
    const error = new Error("Property moderation access required.");
    error.status = 403;
    throw error;
  }
  const normalizedStatus = requiredEnum(status, "status", ["PENDING", "VERIFIED", "ACTIVE", "INACTIVE", "RENTED", "SOLD", "REJECTED"]);
  const current = await getCommercialProperty({ id, includePrivate: true });
  if (!current) {
    const error = new Error("Commercial property not found");
    error.status = 404;
    throw error;
  }
  return updateCommercialProperty({ id, ownerId: current.ownerId, updates: { status: normalizedStatus } });
}

async function buildPropertyRecommendations({ analysis, filters = {} }) {
  if (!analysis?.input?.city) return { properties: [], assumptions: [], source: "no_analysis" };
  const properties = await listPublicProperties({
    city: analysis.input.city,
    transactionType: filters.transactionType,
    propertyType: filters.propertyType,
    districtId: filters.districtId,
    limit: filters.limit || 120
  });
  const ranked = properties
    .map((property) => calculatePropertyFitScore({ property, analysis }))
    .filter((property) => matchesPropertyFilters(property, filters))
    .sort((left, right) => right.propertyFitScore - left.propertyFitScore || left.distanceKm - right.distanceKm);

  return {
    properties: ranked.slice(0, 60),
    transactionComparison: buildTransactionComparison(ranked),
    assumptions: [
      "Rent affordability compares annual rent with the provided startup budget.",
      "Purchase affordability compares the listed purchase price with the provided startup budget.",
      "The score is a screening signal, not a guarantee of business performance."
    ],
    source: ranked.length ? "verified_property_listings" : "no_verified_property_listings"
  };
}

function buildTransactionComparison(properties) {
  const rent = properties.find((property) => property.transactionType === "RENT");
  const sale = properties.find((property) => property.transactionType === "SALE");
  return {
    rent: rent ? { propertyId: rent.id, monthlyCost: rent.price, annualCost: rent.price * 12, propertyFitScore: rent.propertyFitScore } : null,
    buy: sale ? { propertyId: sale.id, purchasePrice: sale.price, propertyFitScore: sale.propertyFitScore } : null,
    explanation: rent && sale
      ? "Rent requires less initial capital and preserves flexibility; purchase requires more capital but creates an owned asset. Compare both against the supplied budget and operating forecast."
      : "A rent-versus-buy comparison is available only when the current market contains both verified rent and sale listings."
  };
}

function calculatePropertyFitScore({ property, analysis }) {
  const recommendation = analysis.recommendation || {};
  const target = recommendation.bestLocation?.coordinates || recommendation.bestLocation?.coordinates || analysis.market?.map?.center;
  const distanceKmValue = target ? distanceKm(property.coordinates, target) : null;
  const distanceScore = distanceKmValue == null ? 50 : clamp(100 - distanceKmValue * 16, 20, 100);
  const areaScore = areaSuitability(property, analysis.input?.businessType);
  const budgetScore = budgetFit(property, Number(analysis.input?.budget));
  const district = findDistrict(analysis, property);
  const opportunityScore = Number(district?.opportunityScore ?? district?.score ?? analysis.opportunityScore?.score ?? 0);
  const opportunityComponent = clamp(opportunityScore, 0, 100);
  const accessibilityScore = accessibilityFit(property);
  const propertyFitScore = Math.round(
    distanceScore * 0.18 +
    areaScore * 0.18 +
    budgetScore * 0.28 +
    opportunityComponent * 0.24 +
    accessibilityScore * 0.12
  );
  const monthlyRent = property.transactionType === "RENT" ? property.price : null;
  const annualRent = monthlyRent == null ? null : monthlyRent * 12;
  const currentCompetition = Number(district?.nearbyCompetitors ?? district?.competitorCountNearby ?? 0);
  const plannedNearby = (analysis.plannedBusinesses || []).filter((plan) => distanceKm(plan.coordinates || plan, property.coordinates) <= 0.5).length;

  return {
    ...property,
    propertyFitScore: clamp(propertyFitScore, 0, 100),
    distanceKm: distanceKmValue == null ? null : Math.round(distanceKmValue * 100) / 100,
    financialFit: {
      budget: Number(analysis.input?.budget) || null,
      annualRent,
      upfrontPurchase: property.transactionType === "SALE" ? property.price : null,
      budgetScore
    },
    marketFit: {
      opportunityScore,
      competitionLevel: competitionLevel(currentCompetition),
      nearbyCompetitors: currentCompetition,
      plannedBusinessesNearby: plannedNearby,
      district: property.districtId || district?.district || district?.name || null
    },
    scoreBreakdown: { distanceScore: round(distanceScore), areaScore: round(areaScore), budgetScore: round(budgetScore), opportunityScore: round(opportunityComponent), accessibilityScore: round(accessibilityScore) },
    fitExplanation: buildFitExplanation({ property, distanceKmValue, budgetScore, opportunityScore, currentCompetition, plannedNearby })
  };
}

function matchesPropertyFilters(property, filters) {
  if (filters.maxPrice != null && property.price > Number(filters.maxPrice)) return false;
  if (filters.minArea != null && property.areaSqm < Number(filters.minArea)) return false;
  if (filters.maxArea != null && property.areaSqm > Number(filters.maxArea)) return false;
  if (filters.radiusKm != null && property.distanceKm != null && property.distanceKm > Number(filters.radiusKm)) return false;
  if (filters.minFitScore != null && property.propertyFitScore < Number(filters.minFitScore)) return false;
  return true;
}

function validatePropertyPayload(payload = {}) {
  const transactionType = requiredEnum(payload.transactionType || payload.transaction_type, "transactionType", ["RENT", "SALE"]);
  const propertyType = requiredText(payload.propertyType || payload.property_type, "propertyType");
  const price = requiredPositive(payload.price, "price");
  const areaSqm = requiredPositive(payload.areaSqm ?? payload.area_sqm, "areaSqm");
  if (areaSqm <= 0) throw bad("areaSqm must be greater than zero");
  const latitude = requiredCoordinate(payload.latitude, "latitude", -90, 90);
  const longitude = requiredCoordinate(payload.longitude, "longitude", -180, 180);
  return {
    title: requiredText(payload.title, "title"),
    description: optionalText(payload.description, 2000),
    propertyType,
    transactionType,
    price,
    pricePerSqm: optionalPositive(payload.pricePerSqm ?? payload.price_per_sqm),
    currency: optionalText(payload.currency, 8) || "KZT",
    areaSqm,
    city: requiredText(payload.city, "city"),
    latitude,
    longitude,
    address: requiredText(payload.address, "address"),
    districtId: optionalText(payload.districtId || payload.district_id, 120),
    floor: optionalInteger(payload.floor),
    totalFloors: optionalInteger(payload.totalFloors ?? payload.total_floors),
    parking: payload.parking == null ? null : Boolean(payload.parking),
    entranceType: optionalText(payload.entranceType || payload.entrance_type, 80),
    condition: optionalText(payload.condition, 80),
    utilities: payload.utilities && typeof payload.utilities === "object" ? payload.utilities : {},
    photos: Array.isArray(payload.photos) ? payload.photos.slice(0, 12).map((photo) => String(photo).slice(0, 500)) : [],
    contactPhone: optionalText(payload.contactPhone || payload.contact_phone, 40),
    contactEmail: optionalText(payload.contactEmail || payload.contact_email, 160),
    source: optionalText(payload.source, 120) || "user_submitted",
    sourceUrl: optionalText(payload.sourceUrl || payload.source_url, 500),
    status: "PENDING"
  };
}

function validatePropertyPatch(payload = {}) {
  const updates = {};
  ["title", "description", "propertyType", "property_type", "address", "districtId", "district_id", "entranceType", "entrance_type", "condition", "source", "sourceUrl", "source_url", "currency", "contactPhone", "contact_phone", "contactEmail", "contact_email"].forEach((key) => {
    if (key in payload) updates[normalizePropertyField(key)] = payload[key] == null ? null : String(payload[key]).trim();
  });
  if ("transactionType" in payload || "transaction_type" in payload) updates.transactionType = requiredEnum(payload.transactionType || payload.transaction_type, "transactionType", ["RENT", "SALE"]);
  ["price", "pricePerSqm", "price_per_sqm", "areaSqm", "area_sqm", "latitude", "longitude", "floor", "totalFloors", "total_floors"].forEach((key) => {
    if (key in payload) updates[normalizePropertyField(key)] = requiredPositive(payload[key], key);
  });
  if ("parking" in payload) updates.parking = payload.parking == null ? null : Boolean(payload.parking);
  if ("utilities" in payload) updates.utilities = payload.utilities || {};
  if ("photos" in payload) updates.photos = Array.isArray(payload.photos) ? payload.photos.slice(0, 12) : [];
  if ("status" in payload) updates.status = requiredEnum(payload.status, "status", ["PENDING", "VERIFIED", "ACTIVE", "INACTIVE", "RENTED", "SOLD", "REJECTED"]);
  return updates;
}

function buildFitExplanation({ property, distanceKmValue, budgetScore, opportunityScore, currentCompetition, plannedNearby }) {
  const reasons = [];
  if (distanceKmValue != null) reasons.push((Math.round(distanceKmValue * 100) / 100) + " km from the recommended location");
  if (budgetScore >= 70) reasons.push("the listed cost fits the supplied startup budget");
  else if (budgetScore < 45) reasons.push("the listed cost puts pressure on the supplied startup budget");
  if (opportunityScore > 0) reasons.push("the surrounding district has an opportunity score of " + opportunityScore + "/100");
  if (currentCompetition > 0) reasons.push(currentCompetition + " nearby competitors are in the current analysis");
  if (plannedNearby > 0) reasons.push(plannedNearby + " planned businesses are nearby");
  return reasons.join("; ") + ".";
}

function areaSuitability(property, businessType) {
  const area = Number(property.areaSqm);
  const normalized = String(businessType || "").toLowerCase();
  const target = normalized.includes("office") || normalized.includes("cowork") ? 80 : normalized.includes("warehouse") || normalized.includes("industrial") ? 300 : normalized.includes("restaurant") || normalized.includes("cafe") || normalized.includes("coffee") ? 90 : 50;
  return clamp(100 - Math.abs(area - target) / Math.max(target, 1) * 100, 20, 100);
}

function budgetFit(property, budget) {
  if (!Number.isFinite(budget) || budget <= 0) return 50;
  const cost = property.transactionType === "RENT" ? property.price * 6 : property.price;
  return clamp(100 - (cost / budget) * 100, 0, 100);
}

function accessibilityFit(property) {
  let score = 50;
  if (property.parking === true) score += 18;
  if (property.entranceType) score += 10;
  if (property.condition) score += 5;
  return clamp(score, 0, 100);
}

function findDistrict(analysis, property) {
  return (analysis.districtMetrics || analysis.opportunityAreas || []).find((district) => district.name === property.districtId || district.district === property.districtId) || null;
}

function competitionLevel(value) { return value >= 5 ? "high" : value >= 3 ? "medium" : "low"; }
function normalizePropertyField(field) { return { property_type: "propertyType", property_type: "propertyType", address: "address", district_id: "districtId", entrance_type: "entranceType", source_url: "sourceUrl", price_per_sqm: "pricePerSqm", area_sqm: "areaSqm", total_floors: "totalFloors", contact_phone: "contactPhone", contact_email: "contactEmail" }[field] || field; }
function requiredText(value, field) { const text = String(value || "").trim(); if (!text) throw bad(field + " is required"); return text.slice(0, 2000); }
function optionalText(value, max) { const text = String(value || "").trim(); return text ? text.slice(0, max) : null; }
function requiredPositive(value, field) { const number = Number(value); if (!Number.isFinite(number) || number < 0) throw bad(field + " must be a non-negative number"); return number; }
function optionalPositive(value) { return value == null || value === "" ? null : requiredPositive(value, "value"); }
function optionalInteger(value) { return value == null || value === "" ? null : Math.trunc(requiredPositive(value, "integer")); }
function requiredCoordinate(value, field, min, max) { const number = Number(value); if (!Number.isFinite(number) || number < min || number > max) throw bad(field + " must be a valid coordinate"); return number; }
function requiredEnum(value, field, allowed) { const normalized = String(value || "").trim().toUpperCase(); if (!allowed.includes(normalized)) throw bad(field + " is invalid"); return normalized; }
function bad(message) { const error = new Error(message); error.status = 400; return error; }
function requireUser(user) { if (!user?.id) throw Object.assign(new Error("Authentication required"), { status: 401 }); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }
function round(value) { return Math.round(Number(value) * 10) / 10; }
function distanceKm(left, right) { const earthRadiusKm = 6371; const dLat = toRadians(Number(right.lat) - Number(left.lat)); const dLng = toRadians(Number(right.lng) - Number(left.lng)); const lat1 = toRadians(Number(left.lat)); const lat2 = toRadians(Number(right.lat)); const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2; return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
function toRadians(value) { return (Number(value) * Math.PI) / 180; }

module.exports = {
  PUBLIC_PROPERTY_STATUSES,
  DEFAULT_RADIUS_KM,
  listPublicProperties,
  createOwnerProperty,
  updateOwnerProperty,
  moderateProperty,
  buildPropertyRecommendations,
  calculatePropertyFitScore,
  validatePropertyPayload
};
