const { createEducationListing, listEducationListings } = require("./database");
const { haversineKm } = require("./geographicData");

const SUBTYPES = new Set(["Tutors", "Courses", "Language schools", "Educational centers", "Exam prep"]);
const FORMATS = new Set(["online", "offline", "hybrid"]);
const LESSON_TYPES = new Set(["individual", "group"]);
const DAILY_PROFILE_LIMIT = 20;

async function submitEducationListing({ user, payload = {} }) {
  if (!user?.id) throw Object.assign(new Error("Authentication required"), { status: 401 });
  const listing = validateEducationListing(payload);
  const owned = await listEducationListings({ ownerId: user.id, limit: 100 });
  const since = Date.now() - 24 * 60 * 60 * 1000;
  if (owned.filter((item) => Date.parse(item.createdAt) >= since).length >= DAILY_PROFILE_LIMIT) {
    throw Object.assign(new Error("Daily education profile limit reached"), { status: 429 });
  }
  return createEducationListing({ ownerId: user.id, listing });
}

async function listPublicEducationListings({ city = "Актау", limit = 200 } = {}) {
  const rows = await listEducationListings({ city, status: ["ACTIVE"], limit });
  return rows.map(({ ownerId, ...item }) => ({
    ...item,
    source: "user_generated",
    sourceLabel: "Объявление пользователя · не проверено",
    demo: false,
    rating: null,
    ratingCount: null
  }));
}

function validateEducationListing(payload) {
  const subtype = requiredEnum(payload.subtype, "subtype", SUBTYPES);
  const coordinates = {
    lat: coordinate(payload.coordinates?.lat ?? payload.latitude, "latitude", -90, 90),
    lng: coordinate(payload.coordinates?.lng ?? payload.longitude, "longitude", -180, 180)
  };
  const aktauCenter = { lat: 43.6532, lng: 51.1975 };
  if (haversineKm(aktauCenter, coordinates) > 25) throw bad("The education location must be within 25 km of Aktau");
  const education = payload.education || {};
  const format = requiredEnum(education.format, "format", FORMATS);
  const lessonType = requiredEnum(education.lessonType, "lessonType", LESSON_TYPES);
  const subjects = stringList(education.subjects, "subjects", 12, 80);
  const schedule = validateSchedule(education.schedule);
  const priceAmount = optionalAmount(payload.priceAmount);
  const publishContact = payload.publishContact === true;
  return {
    category: "education",
    subtype,
    subtypeLabel: subtype,
    title: requiredText(payload.title, "title", 140),
    description: requiredText(payload.description, "description", 1000),
    provider: requiredText(payload.provider, "provider", 120),
    city: "Актау",
    district: optionalText(payload.district, 100),
    address: requiredText(payload.address, "address", 220),
    coordinates,
    priceAmount,
    priceLabel: priceAmount == null ? null : `${new Intl.NumberFormat("ru-RU").format(priceAmount)} ₸${education.pricePeriod ? ` / ${optionalText(education.pricePeriod, 24)}` : ""}`,
    currency: "KZT",
    tags: subjects,
    education: {
      instructor: optionalText(education.instructor, 120),
      subjects,
      qualifications: optionalText(education.qualifications, 500),
      experienceYears: optionalAmount(education.experienceYears, 60),
      format,
      lessonType,
      schedule,
      availabilityNote: optionalText(education.availabilityNote, 240),
      durationMinutes: optionalAmount(education.durationMinutes, 240) || 60
    },
    contactPhone: publishContact ? optionalText(payload.contactPhone, 40) : null,
    contactEmail: publishContact && validEmail(payload.contactEmail) ? payload.contactEmail.trim().slice(0, 160) : null,
    contactUrl: publishContact && /^https:\/\//i.test(String(payload.contactUrl || "")) ? String(payload.contactUrl).slice(0, 500) : null,
    publishContact,
    source: "user_generated",
    sourceLabel: "Объявление пользователя · не проверено",
    demo: false,
    rating: null,
    ratingCount: null,
    status: "ACTIVE"
  };
}

function validateSchedule(value) {
  if (!Array.isArray(value) || !value.length || value.length > 14) throw bad("At least one weekly schedule slot is required");
  return value.map((slot) => {
    const day = Number(slot.day);
    if (!Number.isInteger(day) || day < 0 || day > 6 || !validTime(slot.from) || !validTime(slot.to) || slot.from >= slot.to) throw bad("Invalid schedule slot");
    return { day, from: slot.from, to: slot.to };
  });
}

function stringList(value, field, limit, maxLength) {
  if (!Array.isArray(value) || !value.length || value.length > limit) throw bad(`${field} must contain 1 to ${limit} values`);
  const result = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  if (!result.length || result.some((item) => item.length > maxLength)) throw bad(`Invalid ${field}`);
  return result;
}

function requiredText(value, field, max) {
  const text = String(value || "").trim();
  if (!text) throw bad(`${field} is required`);
  return text.slice(0, max);
}
function optionalText(value, max) { const text = String(value || "").trim(); return text ? text.slice(0, max) : null; }
function optionalAmount(value, max = 100000000) { if (value == null || value === "") return null; const amount = Number(value); if (!Number.isFinite(amount) || amount < 0 || amount > max) throw bad("Invalid numeric value"); return amount; }
function coordinate(value, field, min, max) { const number = Number(value); if (!Number.isFinite(number) || number < min || number > max) throw bad(`${field} is invalid`); return number; }
function requiredEnum(value, field, choices) { const text = String(value || "").trim(); if (!choices.has(text)) throw bad(`${field} is invalid`); return text; }
function validTime(value) { return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
function validEmail(value) { return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function bad(message) { return Object.assign(new Error(message), { status: 400 }); }

module.exports = { submitEducationListing, listPublicEducationListings, validateEducationListing };
