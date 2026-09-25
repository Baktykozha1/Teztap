const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const fs = require("node:fs");
const path = require("node:path");
const { city, demoLocations, lineage, isWithinScope, affectedMembership } = require("../data/neighborhood");

const byId = new Map([city, ...demoLocations].map((item) => [item.id, item]));
const state = {};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent?.filename?.endsWith("services\\neighborhood.js") || parent?.filename?.endsWith("services/neighborhood.js")) {
    if (request === "./database") return { withNeighborhoodState: async (handler) => handler(state) };
    if (request === "./neighborhoodGeo") return { listOpenNeighborhoodLocations: async () => [] };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const service = require("../services/neighborhood");
Module._load = originalLoad;

const alice = { id: "alice", role: "USER" };
const bob = { id: "bob", role: "USER" };
const outsider = { id: "outsider", role: "USER" };
const admin = { id: "admin", role: "ADMIN" };

test("city → microdistrict → complex → building, including a direct building", () => {
  assert.deepEqual(lineage("demo-building-14-1", byId), ["demo-building-14-1", "demo-complex-14", "demo-md-14", "aktau"]);
  assert.deepEqual(lineage("demo-building-15-1", byId), ["demo-building-15-1", "demo-md-15", "aktau"]);
  assert.equal(isWithinScope("demo-md-14", "demo-building-14-1", byId), true);
  assert.equal(isWithinScope("demo-md-15", "demo-building-14-1", byId), false);
});

test("notifications target only affected followers; resident reports stay unverified", async () => {
  await service.followLocation(alice, "demo-building-14-1", { primaryHome: true });
  await service.followLocation(bob, "demo-building-14-2", {});
  await service.followLocation(outsider, "demo-building-15-1", {});
  const report = await service.publishAnnouncement(alice, { affectedLocationIds: ["demo-building-14-1"], category: "electricity", title: "Нет света в подъезде", description: "Жители сообщили о неполадке в подъезде.", verificationLevel: "official" }, { residentReport: true });
  assert.equal(report.announcement.verificationLevel, "resident-report");
  assert.equal(report.announcement.status, "reported");
  assert.equal(report.announcement.sourceLabel.includes("не подтверждено"), true);
  assert.equal((await service.getMyNeighborhood(alice)).notifications.length, 0);
  assert.equal((await service.getCommunity("demo-md-14")).announcements.length, 0);
  assert.equal((await service.getCommunity("demo-building-14-1")).announcements.length, 1);
  assert.equal("publisherId" in (await service.getCommunity("demo-building-14-1")).announcements[0], false);
  await assert.rejects(service.confirmResidentReport(admin, report.announcement.id), { status: 403 });
  assert.equal(affectedMembership({ locationId: "demo-building-14-2", notificationsEnabled: true }, ["demo-building-14-1"], byId), false);
});

test("role cannot self grant; verified scoped representative can notify several homes", async () => {
  await assert.rejects(service.publishAnnouncement(alice, { affectedLocationIds: ["demo-building-14-1"], category: "water", title: "Плановое отключение воды", description: "Плановые работы во дворе жилого комплекса.", startAt: new Date(Date.now() + 86400000).toISOString() }), { status: 403 });
  const application = await service.applyForRole(alice, { role: "utility_provider", locationId: "demo-complex-14", organizationName: "Тестовая служба", evidence: "Подтверждение полномочий для тестового сценария" });
  assert.equal(application.application.status, "pending");
  await assert.rejects(service.moderateItem(bob, "role", application.application.id, "approved"), { status: 403 });
  await service.moderateItem(admin, "role", application.application.id, "approved");
  const startAt = new Date(Date.now() + 86400000).toISOString();
  const expectedEndAt = new Date(Date.now() + 90000000).toISOString();
  const notice = await service.publishAnnouncement(alice, { affectedLocationIds: ["demo-building-14-1", "demo-building-14-2"], category: "water", title: "Плановое отключение воды", description: "Плановые работы во дворе жилого комплекса.", status: "planned", startAt, expectedEndAt });
  assert.equal(notice.announcement.verificationLevel, "official");
  assert.equal(notice.announcement.affectedLocationIds.length, 2);
  assert.equal((await service.getMyNeighborhood(alice)).notifications.length, 1);
  assert.equal((await service.getMyNeighborhood(bob)).notifications.length, 1);
  assert.equal((await service.getMyNeighborhood(outsider)).notifications.length, 0);
  assert.match((await service.getMyNeighborhood(bob)).notifications[0].body, /Начало:.*Окончание:/);
  await assert.rejects(service.publishAnnouncement(alice, { affectedLocationIds: ["demo-building-15-1"], category: "water", title: "Плановое отключение воды", description: "Плановые работы во дворе жилого комплекса.", startAt }), { status: 403 });
  await service.confirmResidentReport(alice, state.announcements.find((item) => item.verificationLevel === "resident-report").id);
  assert.equal((await service.getCommunity("demo-building-14-1")).announcements.find((item) => item.category === "electricity").verificationLevel, "official");
});

test("primary home is unique and community feed inherits parent notice once", async () => {
  await service.followLocation(alice, "demo-building-14-2", { primaryHome: true });
  const mine = await service.getMyNeighborhood(alice);
  assert.equal(mine.follows.filter((item) => item.primaryHome).length, 1);
  assert.equal(mine.primaryHomeId, "demo-building-14-2");
  const community = await service.getCommunity("demo-building-14-2");
  assert.equal(community.announcements.filter((item) => item.title === "Плановое отключение воды").length, 1);
  assert.equal(community.mapLocations.some((item) => item.id === "demo-building-14-2"), true);
});

test("home keeps Mercora first and exposes exactly seven functions", () => {
  const home = fs.readFileSync(path.join(__dirname, "../frontend/app/page.jsx"), "utf8");
  const featureBlock = home.match(/const features = \[([\s\S]*?)\];/)?.[1] || "";
  const keys = [...featureBlock.matchAll(/key: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(keys, ["mercora", "education", "jobs", "services", "marketplace", "places", "neighborhood"]);
  assert.match(home, /07 функций/);
  for (const file of ["page.jsx", "[id]/page.jsx", "moderation/page.jsx"]) assert.equal(fs.existsSync(path.join(__dirname, "../frontend/app/neighborhood", file)), true);
});
