const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { chromium } = require("@playwright/test");

Object.assign(process.env, { NODE_ENV: "test", DATABASE_URL: "", AUTH_SECRET: crypto.randomBytes(48).toString("hex"), GEMINI_API_KEY: "", API_RATE_LIMIT: "10000" });
const businesses = [
  { id: "ui-fixture-1", name: "UI test location", area: "17th microdistrict", address: "Test address", category: "Coffee shop", coordinates: { lat: 43.65, lng: 51.17 }, sourceName: "UI test provider", priceSamples: [] }
];
require("../services/twogis").fetchBusinessesFrom2GIS = async () => ({ businesses, source: { status: "ready", provider: "test" } });
require("../services/overpass").fetchBusinessesFromOverpass = async () => ({ businesses: [], source: { status: "empty", provider: "test" } });
const app = require("../index");
const db = require("../services/database");
const { registerUser } = require("../services/auth");
let backend, frontend, browser;
let frontendLogs = "";
const recordScreenshots = process.env.UI_TEST_SCREENSHOTS === "true";
const testTiers = (process.env.UI_TEST_TIERS || "GUEST,BASIC,PRO,BUSINESS,ADMIN")
  .split(",")
  .map((tier) => tier.trim().toUpperCase())
  .filter(Boolean);

async function main() {
  backend = app.listen(0, "127.0.0.1");
  await once(backend, "listening");
  const backendAddress = `http://127.0.0.1:${backend.address().port}`;
  const probe = net.createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const frontendPort = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const base = `http://localhost:${frontendPort}`;
  frontend = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "localhost", "--port", String(frontendPort)], {
    cwd: path.join(__dirname, "..", "frontend"), windowsHide: true,
    env: { ...process.env, NODE_ENV: "production", API_URL: backendAddress, NEXT_PUBLIC_API_URL: backendAddress },
    stdio: ["ignore", "pipe", "pipe"]
  });
  frontend.stdout.on("data", (data) => { frontendLogs += data; });
  frontend.stderr.on("data", (data) => { frontendLogs += data; });
  for (let i = 0; i < 100; i++) {
    const response = await fetch(`${base}/api/health`).catch(() => null);
    if (response?.ok) break;
    if (frontend.exitCode != null) throw new Error("Frontend exited: " + frontendLogs);
    if (i === 99) throw new Error("Frontend readiness timed out");
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  const executablePath = process.env.PLAYWRIGHT_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
  browser = await chromium.launch({ headless: true, ...(fs.existsSync(executablePath) ? { executablePath } : {}) });
  // Keep screenshots outside the repository so an IDE-open artifact cannot lock a test run.
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "Mercora-access-ui-"));
  for (const tier of testTiers) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let user;
    if (tier !== "GUEST") {
      const email = `${crypto.randomUUID()}@example.test`;
      const password = "browser-test-password";
      const session = await registerUser({ email, password, name: "UI test user" });
      user = session.user;
      await db.updateUserAccess({ userId: user.id, updates: { role: tier === "ADMIN" ? "ADMIN" : "USER", subscriptionPlan: tier === "ADMIN" ? "BASIC" : tier }, allowRole: true });
      const response = await page.request.post(`${base}/api/auth/login`, { headers: { Origin: base }, data: { email, password } });
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).token, undefined, "browser must not receive bearer token");
      const cookie = (await context.cookies()).find((item) => item.name === "mercora_session");
      assert.ok(cookie?.httpOnly);
      assert.equal(cookie.sameSite, "Lax");
    }
    if (["GUEST", "BASIC"].includes(tier)) {
      for (const route of ["/assistant", "/opportunities", "/areas", "/history", "/reports", "/admin"]) {
        await page.goto(base + route);
        await waitForRestrictedRoute(page, `${tier}: ${route}`);
      }
    }
    await page.goto(base + "/analyze");
    await page.waitForFunction(() => document.querySelector(".accessPlanLink") && !document.body.textContent.includes("Checking account access..."));
    await page.locator(".analysisForm select").nth(0).selectOption("coffee_shop");
    await page.locator(".analysisForm select").nth(1).selectOption("Aktau");
    await page.locator(".analysisForm input[type=number]").fill("15000000");
    const completed = page.waitForResponse((response) => response.url().endsWith("/api/analyze-market") && response.request().method() === "POST");
    await page.locator(".analysisForm button[type=submit]").click();
    const response = await completed;
    const result = await response.json();
    assert.equal(response.status(), 200, `${tier} analysis response: ${JSON.stringify(result)}`);
    if (["GUEST", "BASIC"].includes(tier)) {
      assert.equal(result.opportunityScore, undefined);
      await page.locator(".basicAnalysis .leaflet-container").waitFor();
      assert.equal(await page.locator(".consultantWorkspace").count(), 0);
    } else {
      assert.ok(result.opportunityScore);
      await page.locator(".decisionOverview").waitFor();
      await page.locator(".consultantWorkspace").waitFor();
      if (tier === "PRO") assert.equal(result.projectedMarket, undefined);
      else assert.ok(result.projectedMarket);
    }
    await page.locator(".leafletMap").scrollIntoViewIfNeeded();
    await page.locator(".leaflet-container").waitFor();
    if (recordScreenshots) await page.screenshot({ path: path.join(output, `${tier.toLowerCase()}-desktop.png`), fullPage: false });
    await page.waitForTimeout(150);
    const dashboardMarkers = await page.locator(".leafletCustomMarker.competitor, .smartCluster").count();
    assert.ok(dashboardMarkers > 0, `${tier}: dashboard map is missing observed markers; competitors=${result.competitors?.length || 0}`);
    await page.goto(base + "/map");
    await page.locator(".leaflet-container").waitFor();
    await page.waitForTimeout(150);
    assert.ok(await page.locator(".leafletCustomMarker.competitor, .smartCluster").count(), `${tier}: map route is missing observed markers`);
    if (tier === "BASIC") {
      await page.evaluate(() => localStorage.setItem("venturescope-session", JSON.stringify({ user: { role: "ADMIN", subscriptionPlan: "ENTERPRISE" }, plan: "ENTERPRISE" })));
      await page.goto(base + "/assistant");
      await waitForRestrictedRoute(page, "BASIC assistant");
      const blocked = await page.request.post(`${base}/api/chat`, { headers: { Origin: base }, data: { message: "Hello", role: "ADMIN" } });
      assert.equal(blocked.status(), 403);
      const csrf = await page.request.post(`${base}/api/subscription-requests`, { headers: { Origin: "https://untrusted.example" }, data: { plan: "PRO" } });
      assert.equal(csrf.status(), 403);
    }
    if (tier === "PRO") {
      await page.goto(base + "/areas");
      assert.ok(!page.url().includes("/upgrade"));
      await page.locator(".areaFinderForm").waitFor();
      await page.locator(".areaFinderForm select").nth(0).selectOption("Kazakhstan");
      await page.locator(".areaFinderForm select").nth(1).selectOption("Aktau");
      await page.locator(".areaFinderForm select").nth(2).selectOption("coffee_shop");
      await page.locator(".areaFinderForm input[type=number]").fill("15000000");
      const areaResponse = page.waitForResponse((item) => item.url().endsWith("/api/area-analysis/best") && item.request().method() === "POST");
      await page.locator(".areaFinderForm button[type=submit]").click();
      assert.equal((await areaResponse).status(), 200);
      await page.locator(".areaRankCard").first().waitFor();
      await page.locator(".areaMapCard .leaflet-container").waitFor();
      await page.locator(".areaMapCard .leafletAreaMarker, .areaMapCard .leafletCustomMarker, .areaMapCard .smartCluster").first().waitFor();
      assert.ok(await page.locator(".areaMapCard .leafletAreaMarker, .areaMapCard .leafletCustomMarker, .areaMapCard .smartCluster").count(), "PRO: ranked areas must render on the map");
      await page.goto(base + "/opportunities");
      assert.ok(!page.url().includes("/upgrade"));
      await page.goto(base + "/reports");
      await waitForRestrictedRoute(page, "PRO reports");
      await db.updateUserAccess({ userId: user.id, updates: { subscriptionStatus: "CANCELLED" } });
      await page.goto(base + "/opportunities");
      await waitForRestrictedRoute(page, "cancelled PRO opportunities");
    }
    if (tier === "ADMIN") {
      await page.goto(base + "/admin");
      await page.locator(".accessUserRow").first().waitFor();
      if (recordScreenshots) await page.screenshot({ path: path.join(output, "admin-users.png"), fullPage: false });
    }
    await page.goto(base + "/upgrade");
    await page.locator(".accessPlanGrid").waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    if (recordScreenshots) await page.screenshot({ path: path.join(output, `${tier.toLowerCase()}-mobile.png`), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    assert.equal(overflow, false, `${tier}: mobile must not overflow`);
    assert.deepEqual(errors, [], `${tier}: browser runtime errors`);
    await context.close();
    console.log(`${tier}: route access, analysis, map, cookies and mobile layout passed`);
  }
}

async function waitForRestrictedRoute(page, label) {
  await Promise.race([
    page.waitForURL(/\/upgrade\?feature=/, { timeout: 6000 }),
    page.locator(".accessPaywall").waitFor({ state: "visible", timeout: 6000 })
  ]).catch(() => {});
  const redirect = page.url().includes("/upgrade?feature=");
  const paywall = await page.locator(".accessPaywall").count();
  assert.ok(redirect || paywall > 0, `${label} must show an upgrade screen`);
  assert.equal(await page.locator(".consultantWorkspace, .decisionOverview, .platformGrid").count(), 0, `${label} must not render premium content`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (frontend && frontend.exitCode === null) { const stopped = once(frontend, "exit"); frontend.kill(); await stopped; }
  if (backend) { backend.closeAllConnections(); await new Promise((resolve) => backend.close(resolve)); }
});
