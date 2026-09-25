const crypto = require("node:crypto");
const {
  createUser,
  findUserByEmail,
  findUserById,
  publicUser,
  updateUserAccess
} = require("./database");

if (process.env.NODE_ENV === "production" && (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32 || /^(change|replace|your|example)[-_ ]/i.test(process.env.AUTH_SECRET))) {
  throw new Error("A private AUTH_SECRET of at least 32 characters is required in production");
}
const tokenSecret = process.env.AUTH_SECRET || crypto.randomBytes(48).toString("hex");
const tokenTtlSeconds = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 7);

async function registerUser({ email, password, name, company }) {
  validateCredentials({ email, password });
  const passwordHash = hashPassword(password);

  try {
    const user = await createUser({ email, passwordHash, name, company });
    return createSession(await applyDemoSubscription(user));
  } catch (error) {
    if (error.code === "23505" || error.code === "USER_EXISTS") {
      const conflict = new Error("Email already registered");
      conflict.status = 409;
      throw conflict;
    }

    throw error;
  }
}

async function loginUser({ email, password }) {
  validateCredentials({ email, password });
  const user = await findUserByEmail(email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    const error = new Error("Invalid email or password");
    error.status = 401;
    throw error;
  }

  return createSession(await applyDemoSubscription(user));
}

async function authenticateRequest(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return null;
  }

  const payload = verifyToken(token);

  if (!payload) {
    return null;
  }

  const user = await findUserById(payload.sub);
  return publicUser(await applyDemoSubscription(user));
}

async function applyDemoSubscription(user) {
  if (
    !user ||
    process.env.MERCORA_DEMO_MODE !== "true" ||
    (user.subscriptionPlan === "ENTERPRISE" && user.subscriptionStatus === "ACTIVE" && user.subscriptionExpiresAt == null)
  ) {
    return user;
  }

  return updateUserAccess({
    userId: user.id,
    updates: { subscriptionPlan: "ENTERPRISE", subscriptionStatus: "ACTIVE", subscriptionExpiresAt: null }
  });
}

function createSession(user) {
  const safeUser = publicUser(user);

  return {
    user: safeUser,
    token: signToken({
      sub: safeUser.id,
      email: safeUser.email,
      exp: Math.floor(Date.now() / 1000) + tokenTtlSeconds
    })
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [method, salt, hash] = String(storedHash || "").split(":");

  if (method !== "scrypt" || !salt || !hash) {
    return false;
  }

  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");

  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

function signToken(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", tokenSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;

  if (!encodedHeader || !encodedPayload || !signature) {
    return null;
  }

  const expected = crypto
    .createHmac("sha256", tokenSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  if (!safeEqual(signature, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));

    if (!payload.sub || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function validateCredentials({ email, password }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""))) {
    const error = new Error("Valid email is required");
    error.status = 400;
    throw error;
  }

  if (String(password || "").length < 8) {
    const error = new Error("Password must contain at least 8 characters");
    error.status = 400;
    throw error;
  }
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = {
  registerUser,
  loginUser,
  authenticateRequest,
  hashPassword,
  verifyPassword
};
