const { createJobListing, listJobListings } = require("./database");
const { haversineKm } = require("./geographicData");

const SUBTYPES = new Set(["Full-time", "Part-time", "Temporary", "Internships", "Entry-level"]);
const EMPLOYMENT_TYPES = new Set(["full-time", "part-time", "temporary", "internship", "entry-level"]);
const WORK_FORMATS = new Set(["remote", "hybrid", "onsite"]);
const DAILY_LISTING_LIMIT = 20;

async function submitJobListing({ user, payload = {} }) {
  if (!user?.id) throw Object.assign(new Error("Authentication required"), { status: 401 });
  const listing = validateJobListing(payload);
  const owned = await listJobListings({ ownerId: user.id, limit: 100 });
  const since = Date.now() - 24 * 60 * 60 * 1000;
  if (owned.filter((item) => Date.parse(item.createdAt) >= since).length >= DAILY_LISTING_LIMIT) {
    throw Object.assign(new Error("Daily job listing limit reached"), { status: 429 });
  }
  return createJobListing({ ownerId: user.id, listing });
}

async function listPublicJobListings({ city = "Актау", limit = 200 } = {}) {
  const rows = await listJobListings({ city, status: ["ACTIVE"], limit });
  return rows.map(({ ownerId, ...item }) => ({ ...item, source: "user_generated", sourceLabel: "Объявление работодателя · не проверено", demo: false, rating: null, ratingCount: null }));
}

function validateJobListing(payload) {
  const job = payload.job || {};
  const subtype = enumValue(payload.subtype, "subtype", SUBTYPES);
  const coordinates = {
    lat: coordinate(payload.coordinates?.lat ?? payload.latitude, "latitude", -90, 90),
    lng: coordinate(payload.coordinates?.lng ?? payload.longitude, "longitude", -180, 180)
  };
  if (haversineKm({ lat: 43.6532, lng: 51.1975 }, coordinates) > 25) throw invalid("The job location must be within 25 km of Aktau");
  const salaryMin = optionalAmount(job.salaryMin, 100000000);
  const salaryMax = optionalAmount(job.salaryMax, 100000000);
  if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) throw invalid("Maximum salary must be greater than minimum salary");
  const published = job.publishedAt && Number.isFinite(Date.parse(job.publishedAt)) ? new Date(job.publishedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const publishContact = payload.publishContact === true;
  return {
    category: "jobs", subtype, subtypeLabel: subtype,
    title: requiredText(payload.title, "title", 140), description: requiredText(payload.description, "description", 1200),
    provider: requiredText(payload.employerName || payload.provider, "employerName", 140), city: "Актау",
    district: optionalText(payload.district, 100), address: requiredText(payload.address, "address", 220), coordinates,
    priceAmount: salaryMin, priceLabel: salaryMin == null ? "Зарплата не указана" : `${new Intl.NumberFormat("ru-RU").format(salaryMin)}${salaryMax != null && salaryMax !== salaryMin ? `–${new Intl.NumberFormat("ru-RU").format(salaryMax)}` : ""} ₸ / ${optionalText(job.salaryPeriod, 24) || "месяц"}`,
    currency: "KZT", tags: stringList(job.requiredSkills || [], "requiredSkills", 20, 64),
    job: {
      employmentType: enumValue(job.employmentType, "employmentType", EMPLOYMENT_TYPES),
      workFormat: enumValue(job.workFormat, "workFormat", WORK_FORMATS),
      schedule: requiredText(job.schedule, "schedule", 180),
      experienceYears: optionalAmount(job.experienceYears, 60), salaryMin, salaryMax,
      salaryPeriod: optionalText(job.salaryPeriod, 24) || "месяц", publishedAt: published,
      requiredSkills: stringList(job.requiredSkills || [], "requiredSkills", 20, 64),
      requirements: stringList(job.requirements || [], "requirements", 20, 180),
      employer: {
        slug: slugify(requiredText(payload.employerName || payload.provider, "employerName", 140)),
        name: requiredText(payload.employerName || payload.provider, "employerName", 140),
        industry: optionalText(payload.industry, 100), description: optionalText(payload.employerDescription, 600)
      }
    },
    contactPhone: publishContact ? optionalText(payload.contactPhone, 40) : null,
    contactEmail: publishContact && validEmail(payload.contactEmail) ? payload.contactEmail.trim().slice(0, 160) : null,
    contactUrl: publishContact && /^https:\/\//i.test(String(payload.contactUrl || "")) ? String(payload.contactUrl).slice(0, 500) : null,
    source: "user_generated", sourceLabel: "Объявление работодателя · не проверено", demo: false, rating: null, ratingCount: null, status: "ACTIVE"
  };
}

function requiredText(value, field, max) { const text = String(value || "").trim(); if (!text) throw invalid(`${field} is required`); return text.slice(0, max); }
function optionalText(value, max) { const text = String(value || "").trim(); return text ? text.slice(0, max) : null; }
function optionalAmount(value, max) { if (value == null || value === "") return null; const amount = Number(value); if (!Number.isFinite(amount) || amount < 0 || amount > max) throw invalid("Invalid numeric value"); return amount; }
function coordinate(value, field, min, max) { const number = Number(value); if (!Number.isFinite(number) || number < min || number > max) throw invalid(`${field} is invalid`); return number; }
function enumValue(value, field, choices) { const text = String(value || "").trim(); if (!choices.has(text)) throw invalid(`${field} is invalid`); return text; }
function stringList(value, field, limit, maxLength) { if (!Array.isArray(value) || value.length > limit) throw invalid(`${field} must contain up to ${limit} values`); const result = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))]; if (result.some((item) => item.length > maxLength)) throw invalid(`Invalid ${field}`); return result; }
function validEmail(value) { return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function slugify(value) { return String(value).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "").slice(0, 90); }
function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }

module.exports = { submitJobListing, listPublicJobListings, validateJobListing };
