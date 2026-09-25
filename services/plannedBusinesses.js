const {
  createPlannedBusiness,
  listPlannedBusinesses,
  updatePlannedBusiness,
  deletePlannedBusiness,
  findNearbyPlannedBusinesses,
  getCommercialProperty
} = require("./database");
const { buildProjectedMarketModel } = require("./projectedMarket");

const USER_ACTIVE_PLAN_LIMIT = Number(process.env.PLANNED_BUSINESS_USER_LIMIT || 25);
const DUPLICATE_RADIUS_KM = Number(process.env.PLANNED_BUSINESS_DUPLICATE_RADIUS_KM || 0.12);

async function createUserPlannedBusiness({ user, payload }) {
  requireUser(user);
  const input = validatePlannedBusinessPayload(payload);
  if (input.propertyId) {
    const property = await getCommercialProperty({ id: input.propertyId, includePrivate: false });
    if (!property || !["ACTIVE", "VERIFIED"].includes(property.status)) {
      const error = new Error("The selected commercial property is not an active verified listing.");
      error.status = 400;
      throw error;
    }
  }
  const existingPlans = await listPlannedBusinesses({ userId: user.id, status: ["PLANNED", "VERIFIED"], includePrivate: true, limit: USER_ACTIVE_PLAN_LIMIT + 1 });

  if (existingPlans.length >= USER_ACTIVE_PLAN_LIMIT) {
    const error = new Error(`Planned business limit reached (${USER_ACTIVE_PLAN_LIMIT}). Cancel or open an existing plan before adding another.`);
    error.status = 429;
    throw error;
  }

  const duplicates = await findNearbyPlannedBusinesses({
    city: input.city,
    category: input.category,
    latitude: input.latitude,
    longitude: input.longitude,
    radiusKm: DUPLICATE_RADIUS_KM,
    statuses: ["PLANNED", "VERIFIED", "OPEN"]
  });

  if (duplicates.length) {
    const error = new Error("A similar planned business already exists nearby.");
    error.status = 409;
    error.details = { duplicates: duplicates.map(anonymizePlan) };
    throw error;
  }

  return createPlannedBusiness({
    userId: user.id,
    ...input,
    marketImpact: {
      duplicateRadiusKm: DUPLICATE_RADIUS_KM,
      createdFrom: "plan_to_open_here"
    }
  });
}

async function listUserPlannedBusinesses({ user }) {
  requireUser(user);
  return listPlannedBusinesses({ userId: user.id, includePrivate: true, limit: 100 });
}

async function listPublicPlannedBusinesses({ city, category, status = ["PLANNED", "VERIFIED", "OPEN"] }) {
  const records = await listPlannedBusinesses({ city, category, status, includePrivate: false, limit: 250 });
  return records.map(anonymizePlan);
}

async function updateUserPlannedBusiness({ user, id, payload }) {
  requireUser(user);
  const updates = validatePlannedBusinessPatch(payload);
  const updated = await updatePlannedBusiness({ id, userId: user.id, updates });

  if (!updated) {
    const error = new Error("Planned business not found");
    error.status = 404;
    throw error;
  }

  return updated;
}

async function cancelUserPlannedBusiness({ user, id }) {
  requireUser(user);
  const cancelled = await deletePlannedBusiness({ id, userId: user.id });

  if (!cancelled) {
    const error = new Error("Planned business not found");
    error.status = 404;
    throw error;
  }

  return cancelled;
}

async function buildProjectedAnalytics({ analysis, city, category }) {
  const effectiveAnalysis = analysis || {
    input: {
      city: city || null,
      businessType: category || null
    },
    competitors: [],
    opportunityAreas: [],
    opportunityScore: { score: 0 },
    riskAnalysis: { riskScore: 0 }
  };
  const plannedBusinesses = await listPublicPlannedBusinesses({
    city: city || effectiveAnalysis?.input?.city,
    category: category || effectiveAnalysis?.input?.businessType
  });
  const projectedMarket = buildProjectedMarketModel({ analysis: effectiveAnalysis, plannedBusinesses });

  return {
    plannedBusinesses,
    projectedMarket
  };
}

function validatePlannedBusinessPayload(payload = {}) {
  const input = {
    businessName: optionalText(payload.businessName || payload.business_name, 120),
    category: requiredText(payload.category, "category"),
    city: requiredText(payload.city, "city"),
    latitude: requiredCoordinate(payload.latitude, "latitude", -90, 90),
    longitude: requiredCoordinate(payload.longitude, "longitude", -180, 180),
    address: requiredText(payload.address, "address"),
    districtId: optionalText(payload.districtId || payload.district_id, 120),
    budget: optionalPositiveNumber(payload.budget, "budget"),
    businessFormat: optionalText(payload.businessFormat || payload.business_format, 120),
    propertyId: optionalUuid(payload.propertyId || payload.property_id),
    status: normalizeStatus(payload.status),
    source: optionalText(payload.source, 80) || "user_confirmed_plan"
  };

  return input;
}

function validatePlannedBusinessPatch(payload = {}) {
  const updates = {};
  if ("businessName" in payload || "business_name" in payload) updates.businessName = optionalText(payload.businessName || payload.business_name, 120);
  if ("category" in payload) updates.category = requiredText(payload.category, "category");
  if ("city" in payload) updates.city = requiredText(payload.city, "city");
  if ("latitude" in payload) updates.latitude = requiredCoordinate(payload.latitude, "latitude", -90, 90);
  if ("longitude" in payload) updates.longitude = requiredCoordinate(payload.longitude, "longitude", -180, 180);
  if ("address" in payload) updates.address = requiredText(payload.address, "address");
  if ("districtId" in payload || "district_id" in payload) updates.districtId = optionalText(payload.districtId || payload.district_id, 120);
  if ("budget" in payload) updates.budget = optionalPositiveNumber(payload.budget, "budget");
  if ("businessFormat" in payload || "business_format" in payload) updates.businessFormat = optionalText(payload.businessFormat || payload.business_format, 120);
  if ("propertyId" in payload || "property_id" in payload) updates.propertyId = optionalUuid(payload.propertyId || payload.property_id);
  if ("status" in payload) updates.status = normalizeStatus(payload.status);
  return updates;
}

function anonymizePlan(plan) {
  return {
    id: plan.id,
    category: plan.category,
    city: plan.city,
    latitude: plan.latitude,
    longitude: plan.longitude,
    coordinates: plan.coordinates || { lat: plan.latitude, lng: plan.longitude },
    address: plan.address,
    districtId: plan.districtId,
    propertyId: plan.propertyId || null,
    status: plan.status,
    source: plan.source,
    marketImpact: plan.marketImpact,
    createdAt: plan.createdAt
  };
}

function requireUser(user) {
  if (!user?.id) {
    const error = new Error("Authentication required");
    error.status = 401;
    throw error;
  }
}

function requiredText(value, field) {
  const text = String(value || "").trim();
  if (!text) {
    const error = new Error(`${field} is required`);
    error.status = 400;
    throw error;
  }
  return text;
}

function optionalText(value, maxLength) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function requiredCoordinate(value, field, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    const error = new Error(`${field} must be a valid coordinate`);
    error.status = 400;
    throw error;
  }
  return number;
}

function optionalPositiveNumber(value, field) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    const error = new Error(`${field} must be a positive number`);
    error.status = 400;
    throw error;
  }

  return number;
}

function optionalUuid(value) {
  if (value == null || value === "") return null;
  const normalized = String(value).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    const error = new Error("propertyId must be a valid id");
    error.status = 400;
    throw error;
  }
  return normalized;
}

function normalizeStatus(status) {
  const normalized = String(status || "PLANNED").trim().toUpperCase();
  return ["PLANNED", "VERIFIED", "OPEN", "CANCELLED"].includes(normalized) ? normalized : "PLANNED";
}

module.exports = {
  createUserPlannedBusiness,
  listUserPlannedBusinesses,
  listPublicPlannedBusinesses,
  updateUserPlannedBusiness,
  cancelUserPlannedBusiness,
  buildProjectedAnalytics,
  validatePlannedBusinessPayload
};
