const crypto = require("node:crypto");
const { withNeighborhoodState } = require("./database");
const { listOpenNeighborhoodLocations } = require("./neighborhoodGeo");
const { city, demoLocations, announcementCategories, announcementStatuses, locationTypes, lineage, isWithinScope, affectsLocation, affectedMembership } = require("../data/neighborhood");

const PUBLISHER_ROLES = new Set(["building_admin", "utility_provider", "district_admin"]);
const APPLICATION_ROLES = new Set(["building_admin", "utility_provider", "district_admin", "moderator"]);

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function text(value, max = 500) { return String(value ?? "").trim().replace(/[\u0000-\u001f]/g, " ").slice(0, max); }
function required(value, label, max = 500, min = 2) { const result = text(value, max); if (result.length < min) fail(`Укажите ${label}.`); return result; }
function date(value, label, optional = false) { if (optional && !value) return null; const parsed = new Date(value); if (!Number.isFinite(parsed.getTime())) fail(`Неверная дата: ${label}.`); return parsed.toISOString(); }
function stateLists(state) { for (const key of ["locations", "follows", "roles", "announcements", "events", "discussions", "rsvps", "notifications", "issueSubscriptions"]) if (!Array.isArray(state[key])) state[key] = []; return state; }
function publicLocation(location) { const { submittedBy, ...record } = location; return record; }
function isModerator(user, state) { return user?.role === "ADMIN" || state.roles.some((role) => role.userId === user?.id && role.role === "moderator" && role.status === "approved"); }
function requireUser(user) { if (!user?.id) fail("Войдите в аккаунт TezTap.", 401); }

async function catalog(state) {
  const open = await listOpenNeighborhoodLocations();
  const byId = new Map([city, ...demoLocations, ...open, ...stateLists(state).locations.filter((item) => item.reviewStatus === "approved")].map((item) => [item.id, publicLocation(item)]));
  return [...byId.values()];
}

async function listLocations({ query = "" } = {}) {
  const locations = await withNeighborhoodState((state) => catalog(state));
  const needle = text(query, 120).toLocaleLowerCase("ru-RU");
  return { items: needle ? locations.filter((item) => `${item.name} ${item.address} ${item.type}`.toLocaleLowerCase("ru-RU").includes(needle)) : locations, sourceLabels: [...new Set(locations.map((item) => item.sourceLabel).filter(Boolean))] };
}

async function listCityIssues({ category = "" } = {}) {
  const selectedCategory = text(category, 30);
  if (selectedCategory && !announcementCategories.includes(selectedCategory)) fail("Выберите тему городского сообщества.");
  return withNeighborhoodState(async (raw) => {
    const state = stateLists(raw);
    const locations = await catalog(state);
    const byId = new Map(locations.map((item) => [item.id, item]));
    const items = state.announcements.filter((item) => item.publicStatus === "published" && (!selectedCategory || item.category === selectedCategory))
      .map(({ publisherId, ...item }) => {
        const affectedLocations = item.affectedLocationIds.map((id) => byId.get(id)).filter(Boolean);
        const coordinates = affectedLocations.length ? {
          lat: affectedLocations.reduce((sum, location) => sum + location.coordinates.lat, 0) / affectedLocations.length,
          lng: affectedLocations.reduce((sum, location) => sum + location.coordinates.lng, 0) / affectedLocations.length
        } : city.coordinates;
        return { ...item, affectedLocations, coordinates, address: affectedLocations.map((location) => location.name).join(", ") || city.name };
      })
      .sort((a, b) => Number(["resolved", "cancelled"].includes(a.status)) - Number(["resolved", "cancelled"].includes(b.status)) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    return { items, locations: locations.filter((item) => item.type !== "city").map(publicLocation), categories: announcementCategories };
  });
}

async function getCommunity(id) {
  return withNeighborhoodState(async (state) => {
    stateLists(state);
    const locations = await catalog(state);
    const byId = new Map(locations.map((item) => [item.id, item]));
    const location = byId.get(id);
    if (!location) fail("Сообщество не найдено.", 404);
    const ancestors = lineage(id, byId).slice(1).map((parentId) => byId.get(parentId)).filter(Boolean);
    const announcements = state.announcements.filter((item) => item.publicStatus === "published" && affectsLocation(item.affectedLocationIds, id, byId)).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    const events = state.events.filter((item) => item.status === "published" && isWithinScope(item.locationId, id, byId)).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    const discussions = state.discussions.filter((item) => item.locationId === id && item.status === "published").sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const affectedBuildingIds = [...new Set(announcements.filter((item) => item.status === "planned" || item.status === "ongoing" || item.status === "reported").flatMap((item) => locations.filter((entry) => entry.type === "building" && affectsLocation(item.affectedLocationIds, entry.id, byId)).map((entry) => entry.id)))];
    const contacts = Array.isArray(location.contacts) && location.verificationStatus === "verified" ? location.contacts : [];
    return { location, ancestors, children: locations.filter((item) => item.parentId === id), mapLocations: locations.filter((item) => item.id === id || isWithinScope(id, item.id, byId)), announcements: announcements.map(({ publisherId, ...item }) => item), events: events.map(({ creatorId, ...item }) => item), discussions: discussions.map(({ authorId, ...item }) => item), affectedBuildingIds, contacts };
  });
}

async function getMyNeighborhood(user) {
  requireUser(user);
  return withNeighborhoodState((raw) => {
    const state = stateLists(raw);
    return {
      follows: state.follows.filter((item) => item.userId === user.id).map(({ userId, ...item }) => item),
      primaryHomeId: state.follows.find((item) => item.userId === user.id && item.primaryHome)?.locationId || null,
      roles: state.roles.filter((item) => item.userId === user.id).map(({ userId, evidence, ...item }) => item),
      rsvps: state.rsvps.filter((item) => item.userId === user.id).map(({ userId, ...item }) => item),
      notifications: state.notifications.filter((item) => item.userId === user.id && (!item.scheduledAt || Date.parse(item.scheduledAt) <= Date.now())).map(({ userId, ...item }) => item).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 100),
      issueSubscriptions: state.issueSubscriptions.filter((item) => item.userId === user.id).map(({ userId, ...item }) => item)
    };
  });
}

async function followIssueCategory(user, category, follow = true) {
  requireUser(user);
  const selectedCategory = text(category, 30);
  if (!announcementCategories.includes(selectedCategory)) fail("Выберите тему городского сообщества.");
  return withNeighborhoodState((raw) => {
    const state = stateLists(raw);
    state.issueSubscriptions = state.issueSubscriptions.filter((item) => item.userId !== user.id || item.category !== selectedCategory);
    if (follow) state.issueSubscriptions.push({ userId: user.id, category: selectedCategory, createdAt: new Date().toISOString() });
    return { following: Boolean(follow), categories: state.issueSubscriptions.filter((item) => item.userId === user.id).map((item) => item.category) };
  }, { write: true });
}

async function followLocation(user, locationId, options = {}) {
  requireUser(user);
  return withNeighborhoodState(async (raw) => {
    const state = stateLists(raw);
    const locations = await catalog(state);
    const location = locations.find((item) => item.id === locationId);
    if (!location || location.type === "city") fail("Выберите микрорайон, ЖК или дом.");
    const existing = state.follows.find((item) => item.userId === user.id && item.locationId === locationId);
    if (options.follow === false) {
      state.follows = state.follows.filter((item) => item !== existing);
      return { following: false, primaryHomeId: state.follows.find((item) => item.userId === user.id && item.primaryHome)?.locationId || null };
    }
    if (options.primaryHome && location.type !== "building") fail("Основным домом можно выбрать только здание.");
    if (options.primaryHome) for (const item of state.follows) if (item.userId === user.id) item.primaryHome = false;
    const item = existing || { userId: user.id, locationId, createdAt: new Date().toISOString() };
    item.notificationsEnabled = options.notificationsEnabled !== false;
    if (Array.isArray(options.notificationCategories)) {
      item.notificationCategories = [...new Set(options.notificationCategories.map((value) => text(value, 30)).filter((value) => announcementCategories.includes(value)))];
    } else if (!Array.isArray(item.notificationCategories)) {
      item.notificationCategories = [...announcementCategories];
    }
    if (options.primaryHome) item.primaryHome = true;
    if (!existing) state.follows.push(item);
    return { following: true, primaryHomeId: state.follows.find((entry) => entry.userId === user.id && entry.primaryHome)?.locationId || null, notificationsEnabled: item.notificationsEnabled, notificationCategories: item.notificationCategories };
  }, { write: true });
}

async function suggestLocation(user, payload) {
  requireUser(user);
  return withNeighborhoodState(async (raw) => {
    const state = stateLists(raw);
    const locations = await catalog(state);
    const byId = new Map(locations.map((item) => [item.id, item]));
    const type = text(payload.type, 30);
    if (!locationTypes.includes(type)) fail("Выберите тип места.");
    const parent = byId.get(text(payload.parentId, 100));
    const expectedParent = ({ microdistrict: "city", complex: "microdistrict", building: null })[type];
    if (!parent || (expectedParent ? parent.type !== expectedParent : !["microdistrict", "complex"].includes(parent.type))) fail("Неверное место в иерархии.");
    const coordinates = { lat: Number(payload.coordinates?.lat), lng: Number(payload.coordinates?.lng) };
    if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng) || coordinates.lat < 43.3 || coordinates.lat > 43.9 || coordinates.lng < 50.8 || coordinates.lng > 51.5) fail("Выберите точку в районе Актау.");
    const item = { id: crypto.randomUUID(), type, parentId: parent.id, name: required(payload.name, "название", 120), address: required(payload.address, "адрес или район", 180), coordinates, source: "resident-suggestion", sourceLabel: "Предложено жителем · ожидает проверки", verificationStatus: "unverified", reviewStatus: "pending", submittedBy: user.id, createdAt: new Date().toISOString() };
    state.locations.push(item);
    return { suggestion: publicLocation(item) };
  }, { write: true });
}

async function applyForRole(user, payload) {
  requireUser(user);
  return withNeighborhoodState(async (raw) => {
    const state = stateLists(raw);
    const role = text(payload.role, 40);
    if (!APPLICATION_ROLES.has(role)) fail("Неверная роль.");
    const locations = await catalog(state);
    const locationId = text(payload.locationId, 100);
    if (!locations.some((item) => item.id === locationId)) fail("Выберите территорию полномочий.");
    const evidence = required(payload.evidence, "подтверждение полномочий", 1000, 15);
    const item = { id: crypto.randomUUID(), userId: user.id, role, locationId, organizationName: required(payload.organizationName, "организацию", 120), evidence, status: "pending", createdAt: new Date().toISOString(), reviewedAt: null, reviewedBy: null };
    state.roles.push(item);
    return { application: { id: item.id, role, locationId, status: "pending" } };
  }, { write: true });
}

async function publishAnnouncement(user, payload, { residentReport = false } = {}) {
  requireUser(user);
  return withNeighborhoodState(async (raw) => {
    const state = stateLists(raw);
    const locations = await catalog(state);
    const byId = new Map(locations.map((item) => [item.id, item]));
    const ids = [...new Set((Array.isArray(payload.affectedLocationIds) ? payload.affectedLocationIds : [payload.locationId]).map((id) => text(id, 100)).filter(Boolean))];
    if (!ids.length || ids.length > 50 || ids.some((id) => !byId.has(id) || (id === city.id && !residentReport))) fail("Выберите затронутые дома, районы или сообщите о проблеме по всему городу.");
    const category = text(payload.category, 30);
    if (!announcementCategories.includes(category)) fail("Выберите категорию сообщения.");
    let assignment = null;
    if (!residentReport) {
      assignment = state.roles.find((role) => role.userId === user.id && role.status === "approved" && PUBLISHER_ROLES.has(role.role) && ids.every((id) => isWithinScope(role.locationId, id, byId)));
      if (!assignment) fail("Нет подтверждённых полномочий для всех выбранных территорий.", 403);
    }
    const now = new Date().toISOString();
    const status = residentReport ? "reported" : text(payload.status, 20) || "planned";
    if (!residentReport && !announcementStatuses.includes(status)) fail("Неверный статус объявления.");
    const startAt = residentReport ? now : date(payload.startAt, "начало");
    const expectedEndAt = date(payload.expectedEndAt, "ожидаемое окончание", true);
    if (expectedEndAt && Date.parse(expectedEndAt) < Date.parse(startAt)) fail("Окончание должно быть после начала.");
    const verificationLevel = residentReport ? "resident-report" : assignment?.role === "building_admin" ? "administrator" : "official";
    const item = {
      id: crypto.randomUUID(), affectedLocationIds: ids, category,
      title: required(payload.title, "заголовок", 140, 5), description: required(payload.description, "описание", 2000, 10),
      startAt, expectedEndAt, status, publisherId: user.id,
      publishingOrganization: residentReport ? "Сообщение жителя" : assignment?.organizationName || "Модерация TezTap",
      source: residentReport ? "resident-report" : assignment?.role || "platform-moderator",
      sourceLabel: residentReport ? "Сообщили жители · не подтверждено" : verificationLevel === "administrator" ? "Проверенный администратор дома или ЖК" : "Подтверждённый официальный источник",
      verificationLevel, publicStatus: "published", publishedAt: now, updatedAt: now
    };
    state.announcements.push(item);
    if (!residentReport) notifyAffected(state, item, byId);
    return { announcement: item };
  }, { write: true });
}

function notifyAffected(state, announcement, byId) {
  const notified = new Set();
  const recipients = [
    ...state.follows.filter((member) => affectedMembership(member, announcement.affectedLocationIds, byId, announcement.category)).map((member) => ({ userId: member.userId, href: `/neighborhood/${member.locationId}` })),
    ...state.issueSubscriptions.filter((item) => item.category === announcement.category).map((item) => ({ userId: item.userId, href: `/neighborhood/issues?category=${encodeURIComponent(announcement.category)}` }))
  ];
  for (const recipient of recipients) {
    if (notified.has(recipient.userId)) continue;
    notified.add(recipient.userId);
    state.notifications.unshift({ id: crypto.randomUUID(), userId: recipient.userId, source: "neighborhood", title: announcement.title, body: `${announcement.sourceLabel}. Начало: ${new Date(announcement.startAt).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}${announcement.expectedEndAt ? ` · Окончание: ${new Date(announcement.expectedEndAt).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}` : ""}`, href: recipient.href, announcementId: announcement.id, createdAt: new Date().toISOString(), read: false });
  }
  state.notifications = state.notifications.slice(0, 3000);
}

async function confirmResidentReport(user, id) {
  requireUser(user);
  return withNeighborhoodState(async (raw) => {
    const state = stateLists(raw);
    const item = state.announcements.find((entry) => entry.id === id);
    if (!item) fail("Сообщение не найдено.", 404);
    if (item.verificationLevel !== "resident-report") fail("Это сообщение уже проверено.");
    const locations = await catalog(state);
    const byId = new Map(locations.map((location) => [location.id, location]));
    const assignment = state.roles.find((role) => role.userId === user.id && role.status === "approved" && ["utility_provider", "district_admin"].includes(role.role) && item.affectedLocationIds.every((locationId) => isWithinScope(role.locationId, locationId, byId)));
    if (!assignment) fail("Подтверждение доступно только проверенному представителю поставщика или района.", 403);
    item.verificationLevel = "official";
    item.status = "ongoing";
    item.source = assignment.role;
    item.sourceLabel = "Подтверждено уполномоченной организацией";
    item.publishingOrganization = assignment.organizationName;
    item.updatedAt = new Date().toISOString();
    notifyAffected(state, item, byId);
    return { announcement: item };
  }, { write: true });
}

async function createEvent(user, payload) {
  requireUser(user);
  return withNeighborhoodState(async (raw) => {
    const state = stateLists(raw);
    const locations = await catalog(state);
    const location = locations.find((item) => item.id === text(payload.locationId, 100));
    if (!location || location.type === "city") fail("Выберите дом, ЖК или микрорайон.");
    const startsAt = date(payload.startsAt, "время события");
    if (Date.parse(startsAt) < Date.now()) fail("Дата события должна быть в будущем.");
    const byId = new Map(locations.map((item) => [item.id, item]));
    const assignment = state.roles.find((role) => role.userId === user.id && role.status === "approved" && ["building_admin", "district_admin"].includes(role.role) && isWithinScope(role.locationId, location.id, byId));
    const published = Boolean(assignment || isModerator(user, state));
    const item = { id: crypto.randomUUID(), locationId: location.id, title: required(payload.title, "название", 140, 5), description: required(payload.description, "описание", 1500, 10), startsAt, organizer: published ? assignment?.organizationName || "TezTap" : "Предложено жителем", audience: text(payload.audience, 120) || "Жители района", status: published ? "published" : "pending", sourceLabel: published ? "Проверенный организатор" : "Предложение жителя · ожидает проверки", creatorId: user.id, createdAt: new Date().toISOString() };
    state.events.push(item);
    return { event: item };
  }, { write: true });
}

async function rsvpEvent(user, id, attending) {
  requireUser(user);
  return withNeighborhoodState((raw) => {
    const state = stateLists(raw);
    const event = state.events.find((item) => item.id === id && item.status === "published");
    if (!event) fail("Событие не найдено.", 404);
    state.rsvps = state.rsvps.filter((item) => item.userId !== user.id || item.eventId !== id);
    if (attending) {
      state.rsvps.push({ userId: user.id, eventId: id, status: "going", createdAt: new Date().toISOString() });
      const remindAt = new Date(Date.parse(event.startsAt) - 24 * 60 * 60 * 1000).toISOString();
      state.notifications = state.notifications.filter((item) => item.userId !== user.id || item.eventId !== id);
      state.notifications.unshift({ id: crypto.randomUUID(), userId: user.id, source: "neighborhood", title: `Напоминание: ${event.title}`, body: `Событие начнётся ${new Date(event.startsAt).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}.`, href: `/neighborhood/${event.locationId}`, eventId: id, scheduledAt: remindAt, createdAt: new Date().toISOString(), read: false });
    } else state.notifications = state.notifications.filter((item) => item.userId !== user.id || item.eventId !== id);
    return { attending: Boolean(attending) };
  }, { write: true });
}

async function createDiscussion(user, payload) {
  requireUser(user);
  return withNeighborhoodState(async (raw) => {
    const state = stateLists(raw);
    const locations = await catalog(state);
    if (!locations.some((item) => item.id === payload.locationId && item.type !== "city")) fail("Сообщество не найдено.", 404);
    const item = { id: crypto.randomUUID(), locationId: payload.locationId, title: required(payload.title, "вопрос", 140, 5), body: required(payload.body, "описание", 1500, 10), authorLabel: "Житель района", authorId: user.id, status: "published", createdAt: new Date().toISOString() };
    state.discussions.push(item);
    return { discussion: item };
  }, { write: true });
}

async function moderateItem(user, kind, id, decision) {
  requireUser(user);
  return withNeighborhoodState(async (raw) => {
    const state = stateLists(raw);
    if (!isModerator(user, state)) fail("Нужны права модератора.", 403);
    const key = ({ location: "locations", role: "roles", event: "events", discussion: "discussions", report: "announcements" })[kind];
    if (!key) fail("Неверный тип записи.");
    const item = state[key].find((entry) => entry.id === id);
    if (!item) fail("Запись не найдена.", 404);
    if (kind === "role" && user.role !== "ADMIN") fail("Полномочия представителей подтверждает только администратор платформы.", 403);
    if (kind === "report") {
      if (item.verificationLevel !== "resident-report" || decision !== "rejected") fail("Модератор может удалить неподтверждённое сообщение, но не подтверждать коммунальные работы.");
      item.publicStatus = "rejected";
    } else if (kind === "location") {
      if (!["approved", "rejected"].includes(decision)) fail("Неверное решение.");
      item.reviewStatus = decision;
      item.verificationStatus = decision === "approved" ? "community-reviewed" : "unverified";
      if (decision === "approved") item.sourceLabel = "Предложено жителем · проверено модератором";
    } else if (kind === "role") {
      if (!["approved", "rejected"].includes(decision)) fail("Неверное решение.");
      item.status = decision;
    } else {
      if (!["published", "rejected"].includes(decision)) fail("Неверное решение.");
      item.status = decision;
      if (kind === "event" && decision === "published") { item.organizer = "Предложено жителем · одобрено модератором"; item.sourceLabel = "Событие проверено модератором"; }
    }
    item.reviewedAt = new Date().toISOString();
    item.reviewedBy = user.id;
    return { item: kind === "role" ? { ...item, evidence: undefined } : kind === "location" ? publicLocation(item) : item };
  }, { write: true });
}

async function getModerationQueue(user) {
  requireUser(user);
  return withNeighborhoodState((raw) => {
    const state = stateLists(raw);
    if (!isModerator(user, state)) fail("Нужны права модератора.", 403);
    return { locations: state.locations.filter((item) => item.reviewStatus === "pending"), roles: state.roles.filter((item) => item.status === "pending"), events: state.events.filter((item) => item.status === "pending"), reports: state.announcements.filter((item) => item.verificationLevel === "resident-report" && item.publicStatus === "published"), discussions: state.discussions.filter((item) => item.status === "published") };
  });
}

async function markNeighborhoodNotificationRead(user, id) {
  requireUser(user);
  return withNeighborhoodState((raw) => {
    const item = stateLists(raw).notifications.find((entry) => entry.id === id && entry.userId === user.id);
    if (!item) fail("Уведомление не найдено.", 404);
    item.read = true;
    return { notification: { ...item, userId: undefined } };
  }, { write: true });
}

module.exports = { listLocations, listCityIssues, getCommunity, getMyNeighborhood, followLocation, followIssueCategory, suggestLocation, applyForRole, publishAnnouncement, confirmResidentReport, createEvent, rsvpEvent, createDiscussion, moderateItem, getModerationQueue, markNeighborhoodNotificationRead };
