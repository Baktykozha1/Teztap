const WORKSPACE_ARRAYS = ["favorites", "recentSearches", "notifications", "reviews", "chats", "savedFilters", "bookings", "applications"];

function validateWorkspace(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest("Workspace must be an object.");
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 256_000) throw badRequest("Workspace is too large.");
  const state = { version: 1, location: validateLocation(value.location) };
  for (const key of WORKSPACE_ARRAYS) {
    const entries = value[key] === undefined ? [] : value[key];
    if (!Array.isArray(entries) || entries.length > 500) throw badRequest(`${key} must be a list with at most 500 entries.`);
    state[key] = entries.map((entry) => validateEntry(key, entry));
  }
  return state;
}

function validateLocation(value) {
  if (value == null) return { city: "Aktau", radiusKm: 10, coordinates: null, address: "" };
  if (typeof value !== "object" || Array.isArray(value)) throw badRequest("Location preferences are invalid.");
  const radiusKm = Number(value.radiusKm ?? 10);
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 25) throw badRequest("Search radius must be between 1 and 25 km.");
  let coordinates = null;
  if (value.coordinates != null) {
    const lat = Number(value.coordinates.lat);
    const lng = Number(value.coordinates.lng);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) throw badRequest("Location coordinates are invalid.");
    coordinates = { lat, lng };
  }
  return { city: text(value.city, 80) || "Aktau", radiusKm, coordinates, address: text(value.address, 160) };
}

function validateEntry(key, entry) {
  if (typeof entry === "string") {
    if (key !== "favorites" || !entry.trim() || entry.length > 160) throw badRequest(`${key} contains an invalid value.`);
    return entry.trim();
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw badRequest(`${key} contains an invalid entry.`);
  const clean = JSON.parse(JSON.stringify(entry));
  if (Buffer.byteLength(JSON.stringify(clean), "utf8") > 8_000) throw badRequest(`${key} entry is too large.`);
  if (key === "reviews") {
    const rating = Number(clean.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !text(clean.listingTitle, 120)) throw badRequest("Review needs a place name and a rating from 1 to 5.");
    clean.rating = rating;
    clean.text = text(clean.text, 2_000);
    clean.status = "private-draft";
  }
  if (key === "chats" && (!text(clean.threadId, 160) || !text(clean.text, 1_500))) throw badRequest("A chat message needs a thread and message text.");
  if (key === "notifications" && !text(clean.title, 120)) throw badRequest("Notification title is required.");
  if (["bookings", "applications"].includes(key) && !text(clean.title, 160)) throw badRequest(`${key} entry needs a title.`);
  return clean;
}

function validateProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest("Profile is invalid.");
  const name = text(value.name, 100);
  if (name.length < 2) throw badRequest("Name must contain at least 2 characters.");
  const company = text(value.company, 120);
  const profile = {
    phone: text(value.phone, 32),
    about: text(value.about, 600)
  };
  if (profile.phone && !/^\+?[0-9 ()-]{7,32}$/.test(profile.phone)) throw badRequest("Phone number format is invalid.");
  return { name, company, profile };
}

function text(value, max) { return String(value ?? "").trim().slice(0, max); }
function badRequest(message) { return Object.assign(new Error(message), { status: 400, code: "INVALID_WORKSPACE" }); }

module.exports = { validateWorkspace, validateProfile };
