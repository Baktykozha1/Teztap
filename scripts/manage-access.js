require("../services/env").loadEnv();
const { initializeDatabase, findUserByEmail, updateUserAccess, closeDatabase } = require("../services/database");

async function main() {
  const [email, field, value, expiry] = process.argv.slice(2);
  if (!email || !["role", "plan"].includes(field) || !value) {
    throw new Error("Usage: node scripts/manage-access.js email role ADMIN|USER OR email plan BASIC|PRO|BUSINESS|ENTERPRISE [ISO-expiration]");
  }
  const status = await initializeDatabase();
  if (status.mode !== "postgresql") throw new Error("Access assignments require PostgreSQL; no persistent database is connected");
  const user = await findUserByEmail(email);
  if (!user) throw new Error("Register this account first. No user was created or modified.");
  const updates = field === "role" ? { role: value } : {
    subscriptionPlan: value, subscriptionStatus: "ACTIVE", subscriptionExpiresAt: expiry || null
  };
  const updated = await updateUserAccess({ userId: user.id, updates, allowRole: true });
  console.log(`Access updated: ${updated.email} | ${updated.role} | ${updated.subscriptionPlan} | ${updated.subscriptionStatus}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(closeDatabase);
