const {
  createPriceObservation,
  listPriceObservations,
  countPriceObservations,
  moderatePriceObservation
} = require("./database");

const DAILY_SUBMISSION_LIMIT = Number(process.env.PRICE_OBSERVATION_DAILY_LIMIT || 20);
const EVIDENCE_TYPES = ["PUBLIC_MENU", "PUBLIC_CATALOG", "PARTNER_FEED", "RECEIPT"];
const REVIEW_STATUSES = ["PENDING", "VERIFIED", "REJECTED", "EXPIRED"];

async function createUserPriceObservation({ user, payload }) {
  requireUser(user);
  const observation = validatePriceObservationPayload(payload);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const submittedToday = await countPriceObservations({ userId: user.id, since });

  if (submittedToday >= DAILY_SUBMISSION_LIMIT) {
    throw httpError(`Daily price observation limit reached (${DAILY_SUBMISSION_LIMIT}).`, 429);
  }

  return createPriceObservation({ userId: user.id, observation });
}

async function listVerifiedPriceObservations({ city, businessType }) {
  return listPriceObservations({ city, businessType, status: "VERIFIED", includePrivate: false, limit: 300 });
}

async function listUserPriceObservations({ user, city, businessType }) {
  requireUser(user);
  return listPriceObservations({ city, businessType, status: null, userId: user.id, includePrivate: true, limit: 100 });
}

async function reviewPriceObservation({ user, id, status }) {
  requireModerator(user);
  const normalizedStatus = requiredEnum(status, "status", REVIEW_STATUSES);
  const observation = await moderatePriceObservation({ id, status: normalizedStatus });

  if (!observation) {
    throw httpError("Price observation not found", 404);
  }

  return observation;
}

function validatePriceObservationPayload(payload = {}) {
  const sourceUrl = requiredUrl(payload.sourceUrl || payload.source_url, "sourceUrl");

  return {
    city: requiredText(payload.city, "city", 120),
    businessType: requiredText(payload.businessType || payload.business_type, "businessType", 120),
    businessName: requiredText(payload.businessName || payload.business_name, "businessName", 160),
    productName: requiredText(payload.productName || payload.product_name, "productName", 160),
    price: requiredPositiveNumber(payload.price, "price"),
    area: optionalText(payload.area, 120) || "Unspecified area",
    category: optionalText(payload.category, 120),
    sourceName: optionalText(payload.sourceName || payload.source_name, 120) || "Public source submitted to TezTap",
    sourceUrl,
    sourceUpdatedAt: optionalIsoDate(payload.sourceUpdatedAt || payload.source_updated_at),
    confidence: "pending_review",
    evidenceType: requiredEnum(payload.evidenceType || payload.evidence_type || "PUBLIC_MENU", "evidenceType", EVIDENCE_TYPES),
    payload: { submittedAt: new Date().toISOString() }
  };
}

function requireUser(user) {
  if (!user?.id) {
    throw httpError("Authentication required", 401);
  }
}

function requireModerator(user) {
  requireUser(user);
  const moderators = String(process.env.PRICE_MODERATOR_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (user.role !== "ADMIN" && !moderators.includes(String(user.email || "").toLowerCase())) {
    throw httpError("Price observation moderation access required.", 403);
  }
}

function requiredText(value, field, maxLength) {
  const text = String(value || "").trim();
  if (!text) {
    throw httpError(`${field} is required`, 400);
  }
  return text.slice(0, maxLength);
}

function optionalText(value, maxLength) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function requiredPositiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw httpError(`${field} must be a positive number`, 400);
  }
  return number;
}

function requiredUrl(value, field) {
  const text = String(value || "").trim();
  try {
    const url = new URL(text);
    if (!/^https?:$/.test(url.protocol)) {
      throw new Error("unsupported protocol");
    }
    return url.toString();
  } catch {
    throw httpError(`${field} must be a valid public URL`, 400);
  }
}

function optionalIsoDate(value) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw httpError("sourceUpdatedAt must be a valid date", 400);
  }
  return date.toISOString();
}

function requiredEnum(value, field, allowed) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!allowed.includes(normalized)) {
    throw httpError(`${field} must be one of: ${allowed.join(", ")}`, 400);
  }
  return normalized;
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports = {
  createUserPriceObservation,
  listVerifiedPriceObservations,
  listUserPriceObservations,
  reviewPriceObservation,
  validatePriceObservationPayload
};
