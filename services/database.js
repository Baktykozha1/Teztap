const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { PLANS, ROLES, STATUSES } = require("../shared/access");

let Pool = null;

try {
  ({ Pool } = require("pg"));
} catch {
  Pool = null;
}

const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
const databaseUrl = process.env.DATABASE_URL;
const memory = {
  users: [],
  analyses: [],
  chats: [],
  recommendations: [],
  cityEconomicIndicators: [],
  priceObservations: [],
  plannedBusinesses: [],
  commercialProperties: [],
  educationListings: [],
  jobListings: [],
  subscriptionRequests: [],
  accessAudit: [],
  workspaces: [],
  cachedRequests: new Map(),
  neighborhoodState: null
};

let pool = null;
let initialized = false;
let initializationPromise = null;
let status = {
  mode: databaseUrl && Pool ? "postgresql" : "memory",
  ready: false,
  reason: databaseUrl ? null : "DATABASE_URL is not configured"
};

async function initializeDatabase() {
  if (initialized) {
    return getDatabaseStatus();
  }

  if (!initializationPromise) {
    initializationPromise = initializeDatabaseOnce()
      .then(() => {
        initialized = true;
      })
      .finally(() => {
        initializationPromise = null;
      });
  }

  await initializationPromise;
  return getDatabaseStatus();
}

async function initializeDatabaseOnce() {
  if (!databaseUrl || !Pool) {
    if (process.env.NODE_ENV === "production") throw new Error("PostgreSQL is required in production");
    status = {
      mode: "memory",
      ready: true,
      reason: databaseUrl ? "pg package is unavailable" : "DATABASE_URL is not configured"
    };
    return;
  }

  try {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" } : undefined
    });

    const schema = fs.readFileSync(schemaPath, "utf8");
    await pool.query(schema);

    status = {
      mode: "postgresql",
      ready: true,
      reason: null
    };
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
    pool = null;
    status = {
      mode: "memory",
      ready: true,
      reason: `PostgreSQL unavailable: ${error.message}`
    };
  }
}

function getDatabaseStatus() {
  return { ...status };
}

async function createUser({ email, passwordHash, name, company }) {
  await initializeDatabase();
  const normalizedEmail = normalizeEmail(email);
  const now = new Date().toISOString();

  if (pool) {
    const result = await pool.query(
      `INSERT INTO users (id, email, password_hash, name, company)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [crypto.randomUUID(), normalizedEmail, passwordHash, name || "Founder", company || null]
    );
    return normalizeUser(result.rows[0]);
  }

  if (memory.users.some((user) => user.email === normalizedEmail)) {
    const error = new Error("Email already registered");
    error.code = "USER_EXISTS";
    throw error;
  }

  const user = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    passwordHash,
    name: name || "Founder",
    company: company || null,
    profile: {},
    role: "USER",
    subscriptionPlan: "BASIC",
    subscriptionStatus: "ACTIVE",
    subscriptionExpiresAt: null,
    createdAt: now
  };

  memory.users.push(user);
  return user;
}

async function findUserByEmail(email) {
  await initializeDatabase();
  const normalizedEmail = normalizeEmail(email);

  if (pool) {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 LIMIT 1",
      [normalizedEmail]
    );
    return result.rows[0] ? normalizeUser(result.rows[0]) : null;
  }

  return memory.users.find((user) => user.email === normalizedEmail) || null;
}

async function findUserById(id) {
  await initializeDatabase();

  if (!id) {
    return null;
  }

  if (pool) {
    const result = await pool.query(
      "SELECT * FROM users WHERE id = $1 LIMIT 1",
      [id]
    );
    return result.rows[0] ? normalizeUser(result.rows[0]) : null;
  }

  return memory.users.find((user) => user.id === id) || null;
}

async function updateUserProfile({ userId, name, company, profile }) {
  await initializeDatabase();
  if (pool) {
    const result = await pool.query(
      `UPDATE users SET name=$2, company=$3, profile=$4::jsonb, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [userId, name, company || null, JSON.stringify(profile || {})]
    );
    return result.rows[0] ? publicUser(normalizeUser(result.rows[0])) : null;
  }
  const user = memory.users.find((item) => item.id === userId);
  if (!user) return null;
  user.name = name;
  user.company = company || null;
  user.profile = profile || {};
  user.updatedAt = new Date().toISOString();
  return publicUser(user);
}

async function getUserWorkspace({ userId }) {
  await initializeDatabase();
  if (pool) {
    const result = await pool.query("SELECT state FROM user_workspaces WHERE user_id=$1", [userId]);
    return result.rows[0]?.state || {};
  }
  return memory.workspaces.find((item) => item.userId === userId)?.state || {};
}

async function saveUserWorkspace({ userId, state }) {
  await initializeDatabase();
  if (pool) {
    const result = await pool.query(
      `INSERT INTO user_workspaces (user_id, state, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET state=EXCLUDED.state, updated_at=NOW()
       RETURNING state`,
      [userId, JSON.stringify(state)]
    );
    return result.rows[0].state;
  }
  const existing = memory.workspaces.find((item) => item.userId === userId);
  if (existing) existing.state = state;
  else memory.workspaces.push({ userId, state });
  return state;
}

async function saveAnalysis({ userId, input, result }) {
  await initializeDatabase();
  const id = crypto.randomUUID();
  const city = String(input.city || result?.input?.city || "");
  const businessType = String(input.businessType || result?.input?.businessType || "");
  const budget = Number(input.budget || result?.input?.budget || 0);
  const createdAt = new Date().toISOString();

  if (pool) {
    await pool.query(
      `INSERT INTO analyses (id, user_id, city, business_type, budget, input, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, userId || null, city, businessType, budget, input, result]
    );

    await saveMarketSnapshot({ city, businessType, competitors: result.competitors || [], prices: result.prices || [] });

    await pool.query(
      `INSERT INTO ai_recommendations (id, analysis_id, recommendation, probability)
       VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), id, result.recommendation || {}, result.probability || {}]
    );

    return id;
  }

  memory.analyses.unshift({
    id,
    userId: userId || null,
    city,
    businessType,
    budget,
    input,
    result,
    createdAt
  });

  memory.recommendations.unshift({
    id: crypto.randomUUID(),
    analysisId: id,
    recommendation: result.recommendation || {},
    probability: result.probability || {},
    createdAt
  });

  return id;
}

async function saveCityEconomicIndicatorSnapshot({ analysisId = null, userId = null, input = {}, result = {} }) {
  await initializeDatabase();

  const indicator = result.cityEconomicIndicator;

  if (!indicator) {
    return null;
  }

  const record = {
    id: crypto.randomUUID(),
    analysisId: analysisId || null,
    userId: userId || null,
    city: String(input.city || result.input?.city || indicator.city || ""),
    businessType: String(input.businessType || result.input?.businessType || ""),
    budget: Number(input.budget || result.input?.budget || result.budgetPlan?.inputBudget || 0),
    compositeScore: Number(indicator.compositeScore || 0),
    label: indicator.label || null,
    indicator,
    createdAt: new Date().toISOString()
  };

  if (!record.city || !record.businessType) {
    return null;
  }

  if (pool) {
    await pool.query(
      `INSERT INTO city_economic_indicators (
         id, analysis_id, user_id, city, business_type, budget, composite_score, label, indicator
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        record.id,
        record.analysisId,
        record.userId,
        record.city,
        record.businessType,
        record.budget,
        record.compositeScore,
        record.label,
        record.indicator
      ]
    );

    return record.id;
  }

  memory.cityEconomicIndicators.unshift(record);
  memory.cityEconomicIndicators = memory.cityEconomicIndicators.slice(0, 250);
  return record.id;
}

async function listCityEconomicIndicators({ city, businessType = null, limit = 24 }) {
  await initializeDatabase();

  const normalizedCity = String(city || "").trim().toLowerCase();
  const normalizedType = String(businessType || "").trim().toLowerCase();
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 24));

  if (!normalizedCity) {
    return [];
  }

  if (pool) {
    const params = normalizedType ? [normalizedCity, normalizedType, safeLimit] : [normalizedCity, safeLimit];
    const typeClause = normalizedType ? "AND LOWER(business_type) = $2" : "";
    const limitIndex = normalizedType ? "$3" : "$2";
    const result = await pool.query(
      `SELECT id, analysis_id, user_id, city, business_type, budget, composite_score, label, indicator, created_at
       FROM city_economic_indicators
       WHERE LOWER(city) = $1 ${typeClause}
       ORDER BY created_at DESC
       LIMIT ${limitIndex}`,
      params
    );

    return result.rows.map(normalizeCityEconomicIndicator).reverse();
  }

  return memory.cityEconomicIndicators
    .filter((record) => record.city.toLowerCase() === normalizedCity)
    .filter((record) => !normalizedType || record.businessType.toLowerCase() === normalizedType)
    .slice(0, safeLimit)
    .reverse();
}

async function listAnalyses({ userId, limit = 12 }) {
  await initializeDatabase();

  if (pool) {
    const params = userId ? [userId, limit] : [limit];
    const where = userId ? "WHERE user_id = $1" : "";
    const limitIndex = userId ? "$2" : "$1";
    const result = await pool.query(
      `SELECT id, city, business_type, budget, input, result, created_at
       FROM analyses
       ${where}
       ORDER BY created_at DESC
       LIMIT ${limitIndex}`,
      params
    );

    return result.rows.map((row) => ({
      id: row.id,
      city: row.city,
      businessType: row.business_type,
      budget: Number(row.budget),
      input: row.input,
      result: row.result,
      createdAt: row.created_at
    }));
  }

  return memory.analyses
    .filter((analysis) => !userId || analysis.userId === userId)
    .slice(0, limit);
}

async function getAnalysisById({ id, userId = null }) {
  await initializeDatabase();

  if (!id) {
    return null;
  }

  if (pool) {
    const params = userId ? [id, userId] : [id];
    const userClause = userId ? "AND user_id = $2" : "";
    const result = await pool.query(
      `SELECT id, user_id, city, business_type, budget, input, result, created_at
       FROM analyses
       WHERE id = $1 ${userClause}
       LIMIT 1`,
      params
    );
    const row = result.rows[0];

    return row
      ? {
          id: row.id,
          userId: row.user_id,
          city: row.city,
          businessType: row.business_type,
          budget: Number(row.budget),
          input: row.input,
          result: row.result,
          createdAt: row.created_at
        }
      : null;
  }

  return memory.analyses.find((analysis) => analysis.id === id && (!userId || analysis.userId === userId)) || null;
}

async function saveChatMessage({ userId, analysisId, role, content, accessTier = "LEGACY" }) {
  await initializeDatabase();
  const record = {
    id: crypto.randomUUID(),
    userId: userId || null,
    analysisId: analysisId || null,
    role,
    content,
    accessTier,
    createdAt: new Date().toISOString()
  };

  if (pool) {
    await pool.query(
      `INSERT INTO chat_history (id, user_id, analysis_id, role, content, access_tier)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [record.id, record.userId, record.analysisId, record.role, record.content, accessTier]
    );
    return record.id;
  }

  memory.chats.unshift(record);
  return record.id;
}

async function getChatHistory({ userId, limit = 20, accessTier = "LEGACY" }) {
  await initializeDatabase();

  if (!userId) {
    return [];
  }

  if (pool) {
    const result = await pool.query(
      `SELECT role, content, created_at
       FROM chat_history
       WHERE user_id = $1 AND access_tier = $3
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit, accessTier]
    );

    return result.rows
      .reverse()
      .map((row) => ({ role: row.role, content: row.content, createdAt: row.created_at }));
  }

  return memory.chats
    .filter((message) => message.userId === userId && message.accessTier === accessTier)
    .slice(0, limit)
    .reverse();
}

async function createPlannedBusiness({ userId, businessName = null, category, city, latitude, longitude, address, districtId = null, budget = null, businessFormat = null, propertyId = null, status = "PLANNED", source = "user_confirmed_plan", marketImpact = {} }) {
  await initializeDatabase();

  const record = normalizePlannedBusinessInput({
    id: crypto.randomUUID(),
    userId,
    businessName,
    category,
    city,
    latitude,
    longitude,
    address,
    districtId,
    budget,
    businessFormat,
    propertyId,
    status,
    source,
    marketImpact,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  if (pool) {
    const result = await pool.query(
      `INSERT INTO planned_businesses (
         id, user_id, business_name, category, city, latitude, longitude, address,
         district_id, budget, business_format, property_id, status, source, market_impact
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        record.id,
        record.userId,
        record.businessName,
        record.category,
        record.city,
        record.latitude,
        record.longitude,
        record.address,
        record.districtId,
        record.budget,
        record.businessFormat,
        record.propertyId,
        record.status,
        record.source,
        record.marketImpact
      ]
    );

    return normalizePlannedBusiness(result.rows[0], { owner: true });
  }

  memory.plannedBusinesses.unshift(record);
  return normalizePlannedBusiness(record, { owner: true });
}

async function listPlannedBusinesses({ userId = null, city = null, category = null, status = null, includePrivate = false, limit = 100 }) {
  await initializeDatabase();

  const normalizedCity = city ? String(city).trim().toLowerCase() : null;
  const normalizedCategory = category ? String(category).trim().toLowerCase() : null;
  const statuses = normalizeStatusFilter(status);
  const safeLimit = Math.max(1, Math.min(250, Number(limit) || 100));

  if (pool) {
    const params = [];
    const clauses = [];

    if (userId) {
      params.push(userId);
      clauses.push(`user_id = $${params.length}`);
    }

    if (normalizedCity) {
      params.push(normalizedCity);
      clauses.push(`LOWER(city) = $${params.length}`);
    }

    if (normalizedCategory) {
      params.push(normalizedCategory);
      clauses.push(`LOWER(category) = $${params.length}`);
    }

    if (statuses.length) {
      params.push(statuses);
      clauses.push(`status = ANY($${params.length})`);
    }

    params.push(safeLimit);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await pool.query(
      `SELECT *
       FROM planned_businesses
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );

    return result.rows.map((row) => normalizePlannedBusiness(row, { owner: includePrivate || row.user_id === userId }));
  }

  return memory.plannedBusinesses
    .filter((item) => !userId || item.userId === userId)
    .filter((item) => !normalizedCity || item.city.toLowerCase() === normalizedCity)
    .filter((item) => !normalizedCategory || item.category.toLowerCase() === normalizedCategory)
    .filter((item) => !statuses.length || statuses.includes(item.status))
    .slice(0, safeLimit)
    .map((item) => normalizePlannedBusiness(item, { owner: includePrivate || item.userId === userId }));
}

async function updatePlannedBusiness({ id, userId, updates }) {
  await initializeDatabase();
  const normalized = normalizePlannedBusinessUpdate(updates);

  if (pool) {
    const result = await pool.query(
      `UPDATE planned_businesses
       SET business_name = COALESCE($3, business_name),
           category = COALESCE($4, category),
           city = COALESCE($5, city),
           latitude = COALESCE($6, latitude),
           longitude = COALESCE($7, longitude),
           address = COALESCE($8, address),
           district_id = COALESCE($9, district_id),
           budget = CASE WHEN $15 THEN $10 ELSE budget END,
           business_format = COALESCE($11, business_format),
           property_id = COALESCE($12, property_id),
           status = COALESCE($13, status),
           market_impact = COALESCE($14, market_impact),
           updated_at = NOW(),
           verified_at = CASE WHEN $13 = 'VERIFIED' AND verified_at IS NULL THEN NOW() ELSE verified_at END,
           opened_at = CASE WHEN $13 = 'OPEN' AND opened_at IS NULL THEN NOW() ELSE opened_at END
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        id,
        userId,
        normalized.businessName,
        normalized.category,
        normalized.city,
        normalized.latitude,
        normalized.longitude,
        normalized.address,
        normalized.districtId,
        normalized.hasOwnProperty("budget") ? normalized.budget : null,
        normalized.businessFormat,
        normalized.propertyId,
        normalized.status,
        normalized.marketImpact,
        Object.prototype.hasOwnProperty.call(normalized, "budget")
      ]
    );

    return result.rows[0] ? normalizePlannedBusiness(result.rows[0], { owner: true }) : null;
  }

  const item = memory.plannedBusinesses.find((record) => record.id === id && record.userId === userId);
  if (!item) {
    return null;
  }

  Object.assign(item, Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== undefined)), {
    updatedAt: new Date().toISOString()
  });
  if (item.status === "VERIFIED" && !item.verifiedAt) item.verifiedAt = new Date().toISOString();
  if (item.status === "OPEN" && !item.openedAt) item.openedAt = new Date().toISOString();
  return normalizePlannedBusiness(item, { owner: true });
}

async function deletePlannedBusiness({ id, userId }) {
  await initializeDatabase();

  if (pool) {
    const result = await pool.query(
      "UPDATE planned_businesses SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, userId]
    );
    return result.rows[0] ? normalizePlannedBusiness(result.rows[0], { owner: true }) : null;
  }

  const item = memory.plannedBusinesses.find((record) => record.id === id && record.userId === userId);
  if (!item) {
    return null;
  }

  item.status = "CANCELLED";
  item.updatedAt = new Date().toISOString();
  return normalizePlannedBusiness(item, { owner: true });
}

async function findNearbyPlannedBusinesses({ city, category, latitude, longitude, radiusKm = 0.5, excludeUserId = null, statuses = ["PLANNED", "VERIFIED"] }) {
  const records = await listPlannedBusinesses({ city, category, status: statuses, includePrivate: false, limit: 250 });
  return records.filter((record) => {
    if (excludeUserId && record.userId === excludeUserId) return false;
    return distanceKm({ lat: latitude, lng: longitude }, { lat: record.latitude, lng: record.longitude }) <= radiusKm;
  });
}

async function createCommercialProperty({ ownerId = null, property }) {
  await initializeDatabase();
  const record = normalizeCommercialProperty({
    id: crypto.randomUUID(),
    ownerId,
    ...property,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, { includePrivate: true });

  if (pool) {
    const result = await pool.query(
      "INSERT INTO commercial_properties (id, owner_id, title, description, property_type, transaction_type, price, price_per_sqm, currency, area_sqm, city, latitude, longitude, address, district_id, floor, total_floors, parking, entrance_type, condition, utilities, photos, contact_phone, contact_email, source, source_url, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING *",
      [record.id, record.ownerId, record.title, record.description, record.propertyType, record.transactionType, record.price, record.pricePerSqm, record.currency, record.areaSqm, record.city, record.latitude, record.longitude, record.address, record.districtId, record.floor, record.totalFloors, record.parking, record.entranceType, record.condition, record.utilities, record.photos, record.contactPhone, record.contactEmail, record.source, record.sourceUrl, record.status]
    );
    return normalizeCommercialProperty(result.rows[0], { includePrivate: true });
  }

  memory.commercialProperties.unshift(record);
  return normalizeCommercialProperty(record, { includePrivate: true });
}

async function createEducationListing({ ownerId, listing }) {
  await initializeDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record = { id, ownerId, ...listing, createdAt: now, updatedAt: now };
  if (pool) {
    const result = await pool.query(
      `INSERT INTO education_listings (id, owner_id, category, subtype, city, latitude, longitude, status, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id, ownerId, record.category, record.subtype, record.city, record.coordinates.lat, record.coordinates.lng, record.status, record]
    );
    return normalizeEducationListing(result.rows[0]);
  }
  memory.educationListings.unshift(record);
  return normalizeEducationListing(record);
}

async function listEducationListings({ ownerId = null, city = null, status = ["ACTIVE"], limit = 200 } = {}) {
  await initializeDatabase();
  const safeLimit = Math.max(1, Math.min(250, Number(limit) || 200));
  const statuses = (Array.isArray(status) ? status : [status]).map((value) => String(value).toUpperCase());
  if (pool) {
    const params = [];
    const clauses = [];
    if (ownerId) { params.push(ownerId); clauses.push("owner_id = $" + params.length); }
    if (city) { params.push(String(city).toLowerCase()); clauses.push("LOWER(city) = $" + params.length); }
    if (statuses.length) { params.push(statuses); clauses.push("status = ANY($" + params.length + ")"); }
    params.push(safeLimit);
    const result = await pool.query(`SELECT * FROM education_listings${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT $${params.length}`, params);
    return result.rows.map(normalizeEducationListing);
  }
  return memory.educationListings.filter((item) => (!ownerId || item.ownerId === ownerId) && (!city || item.city.toLowerCase() === String(city).toLowerCase()) && (!statuses.length || statuses.includes(item.status)))
    .slice(0, safeLimit).map(normalizeEducationListing);
}

async function createJobListing({ ownerId, listing }) {
  await initializeDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record = { id, ownerId, ...listing, createdAt: now, updatedAt: now };
  if (pool) {
    const result = await pool.query(
      `INSERT INTO job_listings (id, owner_id, category, subtype, city, latitude, longitude, status, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id, ownerId, record.category, record.subtype, record.city, record.coordinates.lat, record.coordinates.lng, record.status, record]
    );
    return normalizeJobListing(result.rows[0]);
  }
  memory.jobListings.unshift(record);
  return normalizeJobListing(record);
}

async function listJobListings({ ownerId = null, city = null, status = ["ACTIVE"], limit = 200 } = {}) {
  await initializeDatabase();
  const safeLimit = Math.max(1, Math.min(250, Number(limit) || 200));
  const statuses = (Array.isArray(status) ? status : [status]).map((value) => String(value).toUpperCase());
  if (pool) {
    const params = [];
    const clauses = [];
    if (ownerId) { params.push(ownerId); clauses.push("owner_id = $" + params.length); }
    if (city) { params.push(String(city).toLowerCase()); clauses.push("LOWER(city) = $" + params.length); }
    if (statuses.length) { params.push(statuses); clauses.push("status = ANY($" + params.length + ")"); }
    params.push(safeLimit);
    const result = await pool.query(`SELECT * FROM job_listings${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT $${params.length}`, params);
    return result.rows.map(normalizeJobListing);
  }
  return memory.jobListings.filter((item) => (!ownerId || item.ownerId === ownerId) && (!city || item.city.toLowerCase() === String(city).toLowerCase()) && (!statuses.length || statuses.includes(item.status)))
    .slice(0, safeLimit).map(normalizeJobListing);
}

function normalizeJobListing(row) {
  if (!row) return null;
  const payload = row.payload || row;
  return { ...payload, id: row.id || payload.id, ownerId: row.owner_id || row.ownerId,
    city: row.city || payload.city, status: row.status || payload.status,
    createdAt: row.created_at?.toISOString?.() || row.createdAt,
    updatedAt: row.updated_at?.toISOString?.() || row.updatedAt };
}

function normalizeEducationListing(row) {
  if (!row) return null;
  const payload = row.payload || row;
  return { ...payload, id: row.id || payload.id, ownerId: row.owner_id || row.ownerId,
    city: row.city || payload.city, status: row.status || payload.status,
    createdAt: row.created_at?.toISOString?.() || row.createdAt,
    updatedAt: row.updated_at?.toISOString?.() || row.updatedAt };
}

async function listCommercialProperties({ ownerId = null, city = null, transactionType = null, propertyType = null, status = null, districtId = null, limit = 100, includePrivate = false }) {
  await initializeDatabase();
  const normalizedCity = city ? String(city).trim().toLowerCase() : null;
  const normalizedTransaction = transactionType ? String(transactionType).trim().toUpperCase() : null;
  const normalizedType = propertyType ? String(propertyType).trim().toLowerCase() : null;
  const normalizedDistrict = districtId ? String(districtId).trim().toLowerCase() : null;
  const statuses = status ? (Array.isArray(status) ? status : String(status).split(",")).map((value) => String(value).trim().toUpperCase()).filter(Boolean) : [];
  const safeLimit = Math.max(1, Math.min(250, Number(limit) || 100));

  if (pool) {
    const params = [];
    const clauses = [];
    if (ownerId) { params.push(ownerId); clauses.push("owner_id = $" + params.length); }
    if (normalizedCity) { params.push(normalizedCity); clauses.push("LOWER(city) = $" + params.length); }
    if (normalizedTransaction) { params.push(normalizedTransaction); clauses.push("transaction_type = $" + params.length); }
    if (normalizedType) { params.push(normalizedType); clauses.push("LOWER(property_type) = $" + params.length); }
    if (normalizedDistrict) { params.push(normalizedDistrict); clauses.push("LOWER(district_id) = $" + params.length); }
    if (statuses.length) { params.push(statuses); clauses.push("status = ANY($" + params.length + ")"); }
    params.push(safeLimit);
    const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
    const result = await pool.query("SELECT * FROM commercial_properties" + where + " ORDER BY created_at DESC LIMIT $" + params.length, params);
    return result.rows.map((row) => normalizeCommercialProperty(row, { includePrivate }));
  }

  return memory.commercialProperties
    .filter((item) => !ownerId || item.ownerId === ownerId)
    .filter((item) => !normalizedCity || item.city.toLowerCase() === normalizedCity)
    .filter((item) => !normalizedTransaction || item.transactionType === normalizedTransaction)
    .filter((item) => !normalizedType || item.propertyType.toLowerCase() === normalizedType)
    .filter((item) => !normalizedDistrict || String(item.districtId || "").toLowerCase() === normalizedDistrict)
    .filter((item) => !statuses.length || statuses.includes(item.status))
    .slice(0, safeLimit)
    .map((item) => normalizeCommercialProperty(item, { includePrivate }));
}

async function getCommercialProperty({ id, includePrivate = false }) {
  await initializeDatabase();
  if (pool) {
    const result = await pool.query("SELECT * FROM commercial_properties WHERE id = $1", [id]);
    return result.rows[0] ? normalizeCommercialProperty(result.rows[0], { includePrivate }) : null;
  }
  const record = memory.commercialProperties.find((item) => item.id === id);
  return record ? normalizeCommercialProperty(record, { includePrivate }) : null;
}

async function updateCommercialProperty({ id, ownerId, updates }) {
  await initializeDatabase();
  const normalized = normalizeCommercialPropertyUpdate(updates);
  if (pool) {
    const fields = Object.keys(normalized);
    if (!fields.length) return getCommercialProperty({ id, includePrivate: true });
    const assignments = fields.map((field, index) => commercialPropertyColumn(field) + " = $" + (index + 3));
    const statusPosition = fields.indexOf("status");
    const verificationUpdate = statusPosition >= 0 ? ", verified_at = CASE WHEN $" + (statusPosition + 3) + " = 'VERIFIED' THEN COALESCE(verified_at, NOW()) ELSE verified_at END" : "";
    const result = await pool.query("UPDATE commercial_properties SET " + assignments.join(", ") + verificationUpdate + ", updated_at = NOW() WHERE id = $1 AND owner_id = $2 RETURNING *", [id, ownerId, ...fields.map((field) => normalized[field])]);
    return result.rows[0] ? normalizeCommercialProperty(result.rows[0], { includePrivate: true }) : null;
  }
  const record = memory.commercialProperties.find((item) => item.id === id && item.ownerId === ownerId);
  if (!record) return null;
  Object.assign(record, normalized, { updatedAt: new Date().toISOString() });
  return normalizeCommercialProperty(record, { includePrivate: true });
}

async function countCommercialProperties({ ownerId, since }) {
  await initializeDatabase();
  if (pool) {
    const result = await pool.query("SELECT COUNT(*)::int AS count FROM commercial_properties WHERE owner_id = $1 AND created_at >= $2", [ownerId, since]);
    return result.rows[0]?.count || 0;
  }
  return memory.commercialProperties.filter((item) => item.ownerId === ownerId && new Date(item.createdAt) >= new Date(since)).length;
}

async function saveMarketSnapshot({ city, businessType, competitors }) {
  if (!pool) {
    return;
  }

  for (const competitor of competitors.slice(0, 180)) {
    const id = competitor.id || stableId([city, businessType, competitor.name, competitor.address, competitor.area]);
    await pool.query(
      `INSERT INTO competitors (
         id, city, business_type, name, address, area, category, rating, ratings_count,
         coordinates, source_name, source_url, source_updated_at, payload, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
       ON CONFLICT (id)
       DO UPDATE SET
         city = EXCLUDED.city,
         business_type = EXCLUDED.business_type,
         name = EXCLUDED.name,
         address = EXCLUDED.address,
         area = EXCLUDED.area,
         category = EXCLUDED.category,
         rating = EXCLUDED.rating,
         ratings_count = EXCLUDED.ratings_count,
         coordinates = EXCLUDED.coordinates,
         source_name = EXCLUDED.source_name,
         source_url = EXCLUDED.source_url,
         source_updated_at = EXCLUDED.source_updated_at,
         payload = EXCLUDED.payload,
         updated_at = NOW()`,
      [
        id,
        city,
        businessType,
        competitor.name,
        competitor.address || null,
        competitor.area || null,
        competitor.category || null,
        numericOrNull(competitor.rating),
        numericOrNull(competitor.ratingsCount),
        competitor.coordinates || null,
        competitor.sourceName || null,
        competitor.sourceUrl || null,
        competitor.sourceUpdatedAt || null,
        competitor
      ]
    );
  }

}

async function createPriceObservation({ userId, observation }) {
  await initializeDatabase();
  const record = normalizePriceObservation({
    id: crypto.randomUUID(),
    userId,
    ...observation,
    verificationStatus: "PENDING",
    verifiedAt: null,
    createdAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString()
  });

  if (pool) {
    const result = await pool.query(
      `INSERT INTO prices (
         id, submitted_by, city, business_type, product_name, price, business_name, area, category,
         source_name, source_url, source_updated_at, confidence, payload, evidence_type,
         verification_status, verified_at, last_checked_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        record.id,
        record.userId,
        record.city,
        record.businessType,
        record.productName,
        record.price,
        record.businessName,
        record.area,
        record.category,
        record.sourceName,
        record.sourceUrl,
        record.sourceUpdatedAt,
        record.confidence,
        record.payload,
        record.evidenceType,
        record.verificationStatus,
        record.verifiedAt,
        record.lastCheckedAt
      ]
    );
    return normalizePriceObservation(result.rows[0], { includePrivate: true });
  }

  memory.priceObservations.unshift(record);
  return normalizePriceObservation(record, { includePrivate: true });
}

async function listPriceObservations({ city, businessType = null, status = "VERIFIED", userId = null, includePrivate = false, limit = 300 }) {
  await initializeDatabase();
  const normalizedCity = String(city || "").trim().toLowerCase();
  const normalizedType = businessType ? String(businessType).trim().toLowerCase() : null;
  const normalizedStatus = status ? String(status).trim().toUpperCase() : null;
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 300));

  if (!normalizedCity) {
    return [];
  }

  if (pool) {
    const params = [normalizedCity];
    const clauses = ["LOWER(city) = $1"];
    if (normalizedType) {
      params.push(normalizedType);
      clauses.push(`LOWER(business_type) = $${params.length}`);
    }
    if (normalizedStatus) {
      params.push(normalizedStatus);
      clauses.push(`verification_status = $${params.length}`);
    }
    if (userId) {
      params.push(userId);
      clauses.push(`submitted_by = $${params.length}`);
    }
    params.push(safeLimit);
    const result = await pool.query(
      `SELECT * FROM prices WHERE ${clauses.join(" AND ")}
       ORDER BY COALESCE(verified_at, created_at) DESC
       LIMIT $${params.length}`,
      params
    );
    return result.rows.map((row) => normalizePriceObservation(row, { includePrivate }));
  }

  return memory.priceObservations
    .filter((record) => record.city.toLowerCase() === normalizedCity)
    .filter((record) => !normalizedType || record.businessType.toLowerCase() === normalizedType)
    .filter((record) => !normalizedStatus || record.verificationStatus === normalizedStatus)
    .filter((record) => !userId || record.userId === userId)
    .slice(0, safeLimit)
    .map((record) => normalizePriceObservation(record, { includePrivate }));
}

async function countPriceObservations({ userId, since }) {
  await initializeDatabase();
  if (pool) {
    const result = await pool.query(
      "SELECT COUNT(*)::int AS count FROM prices WHERE submitted_by = $1 AND created_at >= $2",
      [userId, since]
    );
    return result.rows[0]?.count || 0;
  }
  return memory.priceObservations
    .filter((record) => record.userId === userId && new Date(record.createdAt) >= new Date(since))
    .length;
}

async function moderatePriceObservation({ id, status }) {
  await initializeDatabase();
  const normalizedStatus = String(status || "").trim().toUpperCase();

  if (pool) {
    const result = await pool.query(
      `UPDATE prices
       SET verification_status = $2,
           verified_at = CASE WHEN $2 = 'VERIFIED' THEN COALESCE(verified_at, NOW()) ELSE verified_at END,
           last_checked_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, normalizedStatus]
    );
    return result.rows[0] ? normalizePriceObservation(result.rows[0], { includePrivate: true }) : null;
  }

  const record = memory.priceObservations.find((item) => item.id === id);
  if (!record) {
    return null;
  }
  record.verificationStatus = normalizedStatus;
  record.verifiedAt = normalizedStatus === "VERIFIED" ? record.verifiedAt || new Date().toISOString() : record.verifiedAt;
  record.lastCheckedAt = new Date().toISOString();
  return normalizePriceObservation(record, { includePrivate: true });
}

function normalizePriceObservation(row, { includePrivate = false } = {}) {
  const record = {
    id: row.id,
    userId: row.submitted_by || row.userId || null,
    city: row.city,
    businessType: row.business_type || row.businessType,
    productName: row.product_name || row.productName,
    price: Number(row.price),
    businessName: row.business_name || row.businessName,
    area: row.area,
    category: row.category || null,
    sourceName: row.source_name || row.sourceName || null,
    sourceUrl: row.source_url || row.sourceUrl || null,
    sourceUpdatedAt: row.source_updated_at || row.sourceUpdatedAt || null,
    confidence: row.confidence || null,
    evidenceType: row.evidence_type || row.evidenceType || "PUBLIC_URL",
    verificationStatus: row.verification_status || row.verificationStatus || "PENDING",
    verifiedAt: row.verified_at || row.verifiedAt || null,
    lastCheckedAt: row.last_checked_at || row.lastCheckedAt || null,
    createdAt: row.created_at || row.createdAt || null
  };

  return includePrivate ? record : (({ userId, ...publicRecord }) => publicRecord)(record);
}

function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    company: user.company || null,
    profile: user.profile || {},
    role: user.role || "USER",
    subscriptionPlan: user.subscriptionPlan || "BASIC",
    subscriptionStatus: user.subscriptionStatus || "ACTIVE",
    subscriptionExpiresAt: user.subscriptionExpiresAt || null,
    createdAt: user.createdAt
  };
}

function normalizeUser(row) {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash || row.passwordHash,
    name: row.name,
    company: row.company,
    profile: row.profile || {},
    role: row.role || "USER",
    subscriptionPlan: row.subscription_plan || row.subscriptionPlan || "BASIC",
    subscriptionStatus: row.subscription_status || row.subscriptionStatus || "ACTIVE",
    subscriptionExpiresAt: row.subscription_expires_at || row.subscriptionExpiresAt || null,
    createdAt: row.created_at || row.createdAt
  };
}

function normalizeCityEconomicIndicator(row) {
  return {
    id: row.id,
    analysisId: row.analysis_id || row.analysisId || null,
    userId: row.user_id || row.userId || null,
    city: row.city,
    businessType: row.business_type || row.businessType,
    budget: Number(row.budget),
    compositeScore: Number(row.composite_score ?? row.compositeScore ?? 0),
    label: row.label || null,
    indicator: row.indicator,
    createdAt: row.created_at || row.createdAt
  };
}

function normalizePlannedBusinessInput(record) {
  return {
    ...record,
    category: String(record.category || "").trim(),
    city: String(record.city || "").trim(),
    latitude: Number(record.latitude),
    longitude: Number(record.longitude),
    address: String(record.address || "").trim(),
    districtId: record.districtId || null,
    budget: record.budget === null || record.budget === undefined || record.budget === "" ? null : Number(record.budget),
    businessName: record.businessName ? String(record.businessName).trim() : null,
    businessFormat: record.businessFormat ? String(record.businessFormat).trim() : null,
    propertyId: record.propertyId || record.property_id || null,
    status: normalizePlannedBusinessStatus(record.status),
    source: record.source || "user_confirmed_plan",
    marketImpact: record.marketImpact || {}
  };
}

function normalizePlannedBusinessUpdate(updates = {}) {
  const normalized = {};
  if ("businessName" in updates) normalized.businessName = updates.businessName ? String(updates.businessName).trim() : null;
  if ("category" in updates) normalized.category = String(updates.category || "").trim();
  if ("city" in updates) normalized.city = String(updates.city || "").trim();
  if ("latitude" in updates) normalized.latitude = Number(updates.latitude);
  if ("longitude" in updates) normalized.longitude = Number(updates.longitude);
  if ("address" in updates) normalized.address = String(updates.address || "").trim();
  if ("districtId" in updates) normalized.districtId = updates.districtId || null;
  if ("budget" in updates) normalized.budget = updates.budget === null || updates.budget === "" ? null : Number(updates.budget);
  if ("businessFormat" in updates) normalized.businessFormat = updates.businessFormat ? String(updates.businessFormat).trim() : null;
  if ("propertyId" in updates || "property_id" in updates) normalized.propertyId = updates.propertyId || updates.property_id || null;
  if ("status" in updates) normalized.status = normalizePlannedBusinessStatus(updates.status);
  if ("marketImpact" in updates) normalized.marketImpact = updates.marketImpact || {};
  return normalized;
}

function normalizePlannedBusiness(row, { owner = false } = {}) {
  const record = {
    id: row.id,
    userId: row.user_id || row.userId || null,
    businessName: row.business_name || row.businessName || null,
    category: row.category,
    city: row.city,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    coordinates: { lat: Number(row.latitude), lng: Number(row.longitude) },
    address: row.address,
    districtId: row.district_id || row.districtId || null,
    budget: row.budget === null || row.budget === undefined ? null : Number(row.budget),
    businessFormat: row.business_format || row.businessFormat || null,
    propertyId: row.property_id || row.propertyId || null,
    status: row.status,
    source: row.source,
    marketImpact: row.market_impact || row.marketImpact || {},
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    verifiedAt: row.verified_at || row.verifiedAt || null,
    openedAt: row.opened_at || row.openedAt || null
  };

  if (owner) {
    return record;
  }

  return {
    id: record.id,
    category: record.category,
    city: record.city,
    latitude: record.latitude,
    longitude: record.longitude,
    coordinates: record.coordinates,
    address: record.address,
    districtId: record.districtId,
    propertyId: record.propertyId,
    status: record.status,
    source: record.source,
    marketImpact: record.marketImpact,
    createdAt: record.createdAt
  };
}

function normalizeStatusFilter(status) {
  if (!status) return [];
  const values = Array.isArray(status) ? status : String(status).split(",");
  return values.map(normalizePlannedBusinessStatus).filter(Boolean);
}

function normalizePlannedBusinessStatus(status) {
  const normalized = String(status || "PLANNED").trim().toUpperCase();
  return ["PLANNED", "VERIFIED", "OPEN", "CANCELLED"].includes(normalized) ? normalized : "PLANNED";
}

function normalizeCommercialProperty(row, { includePrivate = false } = {}) {
  const record = {
    id: row.id,
    ownerId: row.owner_id || row.ownerId || null,
    title: String(row.title || "Commercial property").trim(),
    description: row.description || null,
    propertyType: String(row.property_type || row.propertyType || "commercial").trim(),
    transactionType: String(row.transaction_type || row.transactionType || "RENT").toUpperCase(),
    price: Number(row.price || 0),
    pricePerSqm: row.price_per_sqm == null && row.pricePerSqm == null ? null : Number(row.price_per_sqm ?? row.pricePerSqm),
    currency: row.currency || "KZT",
    areaSqm: Number(row.area_sqm ?? row.areaSqm ?? 0),
    city: row.city,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    coordinates: { lat: Number(row.latitude), lng: Number(row.longitude) },
    address: row.address,
    districtId: row.district_id || row.districtId || null,
    floor: row.floor == null ? null : Number(row.floor),
    totalFloors: row.total_floors == null && row.totalFloors == null ? null : Number(row.total_floors ?? row.totalFloors),
    parking: row.parking == null ? null : Boolean(row.parking),
    entranceType: row.entrance_type || row.entranceType || null,
    condition: row.condition || null,
    utilities: row.utilities || {},
    photos: Array.isArray(row.photos) ? row.photos : [],
    source: row.source || "unverified",
    sourceUrl: row.source_url || row.sourceUrl || null,
    status: String(row.status || "PENDING").toUpperCase(),
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    verifiedAt: row.verified_at || row.verifiedAt || null
  };

  if (includePrivate) {
    return { ...record, contactPhone: row.contact_phone || row.contactPhone || null, contactEmail: row.contact_email || row.contactEmail || null, ownerId: record.ownerId };
  }

  const { ownerId, contactPhone, contactEmail, ...publicRecord } = record;
  return publicRecord;
}

function normalizeCommercialPropertyUpdate(updates = {}) {
  const normalized = {};
  const textFields = ["title", "description", "propertyType", "address", "districtId", "entranceType", "condition", "source", "sourceUrl", "currency"];
  textFields.forEach((field) => {
    if (field in updates) normalized[field] = updates[field] == null ? null : String(updates[field]).trim();
  });
  if ("transactionType" in updates) normalized.transactionType = String(updates.transactionType).toUpperCase();
  ["price", "pricePerSqm", "areaSqm", "latitude", "longitude", "floor", "totalFloors"].forEach((field) => {
    if (field in updates) normalized[field] = updates[field] == null || updates[field] === "" ? null : Number(updates[field]);
  });
  ["parking"].forEach((field) => { if (field in updates) normalized[field] = updates[field] == null ? null : Boolean(updates[field]); });
  ["utilities", "photos"].forEach((field) => { if (field in updates) normalized[field] = updates[field] || (field === "photos" ? [] : {}); });
  ["contactPhone", "contactEmail"].forEach((field) => { if (field in updates) normalized[field] = updates[field] == null ? null : String(updates[field]).trim(); });
  if ("status" in updates) normalized.status = String(updates.status).toUpperCase();
  return normalized;
}

function commercialPropertyColumn(field) {
  return {
    title: "title", description: "description", propertyType: "property_type", transactionType: "transaction_type",
    price: "price", pricePerSqm: "price_per_sqm", currency: "currency", areaSqm: "area_sqm", address: "address",
    districtId: "district_id", floor: "floor", totalFloors: "total_floors", parking: "parking", entranceType: "entrance_type",
    condition: "condition", utilities: "utilities", photos: "photos", contactPhone: "contact_phone", contactEmail: "contact_email",
    source: "source", sourceUrl: "source_url", status: "status"
  }[field] || "updated_at";
}

function distanceKm(left, right) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(Number(right.lat) - Number(left.lat));
  const dLng = toRadians(Number(right.lng) - Number(left.lng));
  const lat1 = toRadians(Number(left.lat));
  const lat2 = toRadians(Number(right.lat));
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function stableId(parts) {
  return crypto.createHash("sha1").update(parts.filter(Boolean).join("|").toLowerCase()).digest("hex");
}

function stableUuid(parts) {
  const hex = crypto.createHash("md5").update(parts.filter(Boolean).join("|").toLowerCase()).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function listAccessUsers({ limit = 50, offset = 0 } = {}) {
  await initializeDatabase();
  if (pool) {
    const result = await pool.query(
      `SELECT u.*, r.requested_plan FROM users u LEFT JOIN subscription_requests r ON r.user_id = u.id
       ORDER BY u.created_at DESC, u.id LIMIT $1 OFFSET $2`, [limit, offset]
    );
    return result.rows.map((row) => ({ ...publicUser(normalizeUser(row)), requestedPlan: row.requested_plan || null }));
  }
  return memory.users.slice(offset, offset + limit).map((user) => ({
    ...publicUser(user), requestedPlan: memory.subscriptionRequests.find((r) => r.userId === user.id)?.plan || null
  }));
}

async function requestSubscription({ userId, plan }) {
  await initializeDatabase();
  if (!PLANS.includes(plan) || plan === "BASIC") throw Object.assign(new Error("Invalid requested plan"), { status: 400 });
  if (pool) {
    await pool.query(`INSERT INTO subscription_requests (user_id, requested_plan) VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET requested_plan = $2, updated_at = NOW()`, [userId, plan]);
  } else {
    memory.subscriptionRequests = memory.subscriptionRequests.filter((r) => r.userId !== userId);
    memory.subscriptionRequests.push({ userId, plan });
  }
  return { requestedPlan: plan, status: "REQUESTED" };
}

async function updateUserAccess({ userId, actorId = null, updates, allowRole = false }) {
  await initializeDatabase();
  const allowed = ["subscriptionPlan", "subscriptionStatus", "subscriptionExpiresAt", ...(allowRole ? ["role"] : [])];
  if (!updates || !Object.keys(updates).length || Object.keys(updates).some((key) => !allowed.includes(key))) {
    throw Object.assign(new Error("Invalid access fields"), { status: 400 });
  }
  if ((updates.role !== undefined && !ROLES.includes(updates.role)) ||
      (updates.subscriptionPlan !== undefined && !PLANS.includes(updates.subscriptionPlan)) ||
      (updates.subscriptionStatus !== undefined && !STATUSES.includes(updates.subscriptionStatus)) ||
      (updates.subscriptionExpiresAt != null && (typeof updates.subscriptionExpiresAt !== "string" || !Number.isFinite(Date.parse(updates.subscriptionExpiresAt))))) {
    throw Object.assign(new Error("Invalid role, plan, status or expiration date"), { status: 400 });
  }
  const client = pool ? await pool.connect() : null;
  try {
    if (client) {
      await client.query("BEGIN");
      // Serialize role changes, including protection of the last administrator.
      await client.query("SELECT pg_advisory_xact_lock(71824591)");
    }
    const row = client ? (await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId])).rows[0] : memory.users.find((u) => u.id === userId);
    if (!row) throw Object.assign(new Error("User not found"), { status: 404 });
    const before = publicUser(normalizeUser(row));
    if (before.role === "ADMIN" && updates.role === "USER") {
      const count = client ? Number((await client.query("SELECT COUNT(*) FROM users WHERE role = 'ADMIN'")).rows[0].count) : memory.users.filter((u) => u.role === "ADMIN").length;
      if (count <= 1) throw Object.assign(new Error("Cannot remove the last administrator"), { status: 409 });
    }
    const after = { ...before, ...updates };
    if (client) {
      await client.query(`UPDATE users SET role=$2, subscription_plan=$3, subscription_status=$4,
        subscription_expires_at=$5, updated_at=NOW() WHERE id=$1`,
      [userId, after.role, after.subscriptionPlan, after.subscriptionStatus, after.subscriptionExpiresAt]);
      await client.query(`INSERT INTO access_audit (id, actor_id, user_id, action, before_access, after_access)
        VALUES ($1,$2,$3,$4,$5,$6)`, [crypto.randomUUID(), actorId, userId, allowRole ? "SERVER_ACCESS_ASSIGNMENT" : "SUBSCRIPTION_UPDATE", before, after]);
      await client.query("DELETE FROM subscription_requests WHERE user_id=$1", [userId]);
      await client.query("COMMIT");
    } else {
      Object.assign(row, updates);
      memory.accessAudit.push({ actorId, userId, before, after });
      memory.subscriptionRequests = memory.subscriptionRequests.filter((r) => r.userId !== userId);
    }
    return after;
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    throw error;
  } finally {
    client?.release();
  }
}

async function getCachedRequest({ cacheKey, source }) {
  await initializeDatabase();
  if (!cacheKey || !source) return null;
  if (pool) {
    const result = await pool.query(
      "SELECT response FROM cached_requests WHERE cache_key = $1 AND source = $2 AND expires_at > NOW() LIMIT 1",
      [cacheKey, source]
    );
    return result.rows[0]?.response || null;
  }
  const key = `${source}:${cacheKey}`;
  const entry = memory.cachedRequests.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    memory.cachedRequests.delete(key);
    return null;
  }
  return entry.response;
}

let nextCacheCleanupAt = 0;
async function saveCachedRequest({ cacheKey, source, request, response, ttlMs }) {
  await initializeDatabase();
  if (!cacheKey || !source || !Number.isFinite(Number(ttlMs)) || Number(ttlMs) <= 0) return;
  const expiresAt = new Date(Date.now() + Number(ttlMs)).toISOString();
  if (pool) {
    await pool.query(
      `INSERT INTO cached_requests (cache_key, source, request, response, expires_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
       ON CONFLICT (cache_key) DO UPDATE SET source = EXCLUDED.source, request = EXCLUDED.request,
         response = EXCLUDED.response, expires_at = EXCLUDED.expires_at, created_at = NOW()`,
      [cacheKey, source, JSON.stringify(request || {}), JSON.stringify(response), expiresAt]
    );
    if (Date.now() >= nextCacheCleanupAt) {
      nextCacheCleanupAt = Date.now() + 60 * 60 * 1000;
      await pool.query("DELETE FROM cached_requests WHERE source = $1 AND expires_at < NOW() - INTERVAL '7 days'", [source]);
    }
    return;
  }
  const key = `${source}:${cacheKey}`;
  memory.cachedRequests.set(key, { response, expiresAt: Date.parse(expiresAt) });
  if (memory.cachedRequests.size > 1000) memory.cachedRequests.delete(memory.cachedRequests.keys().next().value);
}

async function closeDatabase() {
  if (pool) await pool.end();
}

async function withNeighborhoodState(handler, { write = false } = {}) {
  await initializeDatabase();
  if (!pool) {
    if (!memory.neighborhoodState) memory.neighborhoodState = {};
    return handler(memory.neighborhoodState);
  }
  const client = await pool.connect();
  try {
    if (write) await client.query("BEGIN");
    await client.query("INSERT INTO neighborhood_state (id, state) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING");
    const row = await client.query(`SELECT state FROM neighborhood_state WHERE id=1${write ? " FOR UPDATE" : ""}`);
    const state = row.rows[0]?.state || {};
    const result = await handler(state);
    if (write) {
      await client.query("UPDATE neighborhood_state SET state=$1::jsonb, updated_at=NOW() WHERE id=1", [JSON.stringify(state)]);
      await client.query("COMMIT");
    }
    return result;
  } catch (error) {
    if (write) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listAccessUsers,
  requestSubscription,
  updateUserAccess,
  getCachedRequest,
  saveCachedRequest,
  closeDatabase,
  initializeDatabase,
  getDatabaseStatus,
  createUser,
  findUserByEmail,
  findUserById,
  updateUserProfile,
  getUserWorkspace,
  saveUserWorkspace,
  saveAnalysis,
  saveCityEconomicIndicatorSnapshot,
  listAnalyses,
  listCityEconomicIndicators,
  getAnalysisById,
  saveChatMessage,
  getChatHistory,
  createPlannedBusiness,
  listPlannedBusinesses,
  updatePlannedBusiness,
  deletePlannedBusiness,
  findNearbyPlannedBusinesses,
  createEducationListing,
  listEducationListings,
  createJobListing,
  listJobListings,
  createCommercialProperty,
  listCommercialProperties,
  getCommercialProperty,
  updateCommercialProperty,
  countCommercialProperties,
  createPriceObservation,
  listPriceObservations,
  countPriceObservations,
  moderatePriceObservation,
  publicUser,
  withNeighborhoodState
};
