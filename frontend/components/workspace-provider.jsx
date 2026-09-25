"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAccess } from "./access-provider";

const WorkspaceContext = createContext(null);
const SECTIONS = ["favorites", "recentSearches", "notifications", "reviews", "chats", "savedFilters", "bookings", "applications"];
const EMPTY = { version: 1, location: { city: "Aktau", radiusKm: 10, coordinates: null, address: "" }, favorites: [], recentSearches: [], notifications: [], reviews: [], chats: [], savedFilters: [], bookings: [], applications: [] };

export function WorkspaceProvider({ children }) {
  const { user, status: accessStatus } = useAccess();
  const userId = user?.id || "guest";
  const storageKey = `mercora.workspace.v1:${userId}`;
  const [workspace, setWorkspace] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("local");
  const [notice, setNotice] = useState("");
  const stateRef = useRef(EMPTY);
  const readyRef = useRef(false);
  const queueRef = useRef(Promise.resolve());

  const persist = useCallback((next) => {
    stateRef.current = next;
    setWorkspace(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { setNotice("Изменения видны в этой вкладке, но браузер не смог их сохранить."); }
    if (user?.id && readyRef.current) {
      setSyncStatus("saving");
      queueRef.current = queueRef.current.then(async () => {
        const response = await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
        if (!response.ok) throw new Error("Не удалось синхронизировать профиль.");
        setSyncStatus("synced");
      }).catch(() => { setSyncStatus("offline"); setNotice("Сохранено на устройстве. Серверная синхронизация временно недоступна."); });
    }
    return next;
  }, [storageKey, user?.id]);

  useEffect(() => {
    if (accessStatus === "loading") return;
    readyRef.current = false;
    setLoading(true);
    let local = EMPTY;
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null");
      if (saved && typeof saved === "object") local = normalizeWorkspace(saved);
      else if (!user?.id) {
        const oldFavorites = JSON.parse(window.localStorage.getItem("mercora.discovery.favorites.v1") || "[]");
        if (Array.isArray(oldFavorites)) local = { ...EMPTY, favorites: oldFavorites.filter((item) => typeof item === "string").slice(0, 500) };
      }
      const legacyCity = window.localStorage.getItem("mercora.discovery.city");
      if (legacyCity) local = { ...local, location: { ...local.location, city: legacyCity.slice(0, 80) } };
      local = mergeWorkspace(local, readLegacyWorkspace());
    } catch { local = EMPTY; }
    stateRef.current = local;
    setWorkspace(local);
    setLoading(false);
    readyRef.current = true;
    if (!user?.id) { setSyncStatus("local"); return; }
    let active = true;
    fetch("/api/workspace", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Workspace unavailable");
      const data = await response.json();
      if (!active) return;
      const merged = mergeWorkspace(normalizeWorkspace(data.workspace), stateRef.current);
      persist(merged);
      setSyncStatus("synced");
    }).catch(() => { if (active) setSyncStatus("offline"); });
    return () => { active = false; };
  }, [accessStatus, storageKey, user?.id, persist]);

  const updateSection = useCallback((section, updater) => {
    if (!SECTIONS.includes(section)) return;
    const current = stateRef.current;
    const value = typeof updater === "function" ? updater(current[section]) : updater;
    return persist({ ...current, [section]: value });
  }, [persist]);

  const toggleFavorite = useCallback((id) => {
    const safeId = String(id || "").slice(0, 160);
    if (!safeId) return;
    const wasFavorite = stateRef.current.favorites.includes(safeId);
    updateSection("favorites", (items) => items.includes(safeId) ? items.filter((item) => item !== safeId) : [safeId, ...items].slice(0, 500));
    setNotice(wasFavorite ? "Удалено из избранного." : "Добавлено в избранное.");
  }, [updateSection]);

  const addNotification = useCallback((record) => updateSection("notifications", (items) => [{ id: makeId(), title: clean(record.title, 120) || "Обновление TezTap", body: clean(record.body, 500), href: safeHref(record.href), createdAt: new Date().toISOString(), read: false }, ...items].slice(0, 200)), [updateSection]);
  const addActivity = useCallback((kind, record) => {
    const section = ({ booking: "bookings", application: "applications", review: "reviews", message: "chats" })[kind];
    if (!section) return;
    const entry = { ...record, id: record?.id || makeId(), createdAt: record?.createdAt || new Date().toISOString() };
    updateSection(section, (items) => [entry, ...items.filter((item) => item.id !== entry.id)].slice(0, 300));
    if (["booking", "application", "review"].includes(kind)) addNotification({ title: ({ booking: "Запрос на запись сохранён", application: "Отклик сохранён", review: "Отзыв сохранён как черновик" })[kind], body: `${entry.title || "Запись"} · хранится в вашем профиле` });
  }, [addNotification, updateSection]);
  const recordSearch = useCallback((record) => updateSection("recentSearches", (items) => [{ id: makeId(), query: clean(record.query, 160), category: clean(record.category, 40), createdAt: new Date().toISOString(), href: safeHref(record.href) }, ...items.filter((item) => item.query !== record.query || item.category !== record.category)].slice(0, 50)), [updateSection]);
  const saveFilter = useCallback((record) => {
    const item = { id: makeId(), label: clean(record.label, 100) || "Мой фильтр", href: safeHref(record.href) || "/search", category: clean(record.category, 40), state: record.state || {}, createdAt: new Date().toISOString() };
    updateSection("savedFilters", (items) => [item, ...items].slice(0, 50));
    setNotice("Фильтр сохранён в профиле.");
  }, [updateSection]);
  const setLocation = useCallback((location) => {
    const radius = Number(location.radiusKm);
    if (!location.city?.trim() || location.city.trim().length > 80 || !Number.isFinite(radius) || radius < 1 || radius > 25) { setNotice("Укажите город и радиус от 1 до 25 км."); return false; }
    persist({ ...stateRef.current, location: { city: location.city.trim(), radiusKm: radius, coordinates: validCoordinates(location.coordinates), address: clean(location.address, 160) } });
    setNotice("Настройки местоположения сохранены.");
    return true;
  }, [persist]);
  const addReview = useCallback((review) => {
    const title = clean(review.listingTitle, 120);
    const rating = Number(review.rating);
    const body = clean(review.text, 2_000);
    if (title.length < 2 || !Number.isInteger(rating) || rating < 1 || rating > 5 || body.length < 3) { setNotice("Для отзыва укажите название, оценку от 1 до 5 и комментарий от 3 символов."); return false; }
    addActivity("review", { ...review, id: makeId(), listingTitle: title, rating, text: body, status: "private-draft" });
    setNotice("Отзыв сохранён как личный черновик. Он не опубликован и не влияет на рейтинг.");
    return true;
  }, [addActivity]);
  const sendMessage = useCallback((message) => {
    const text = clean(message.text, 1_500);
    if (!text) { setNotice("Сообщение не может быть пустым."); return false; }
    addActivity("message", { ...message, id: makeId(), text, threadId: clean(message.threadId, 160) || "general", createdAt: new Date().toISOString(), delivery: "local-demo" });
    setNotice("Сообщение сохранено в локальном MVP-чате. Получатель его не получил.");
    return true;
  }, [addActivity]);
  const markNotificationRead = useCallback((id) => {
    const item = stateRef.current.notifications.find((entry) => entry.id === id);
    updateSection("notifications", (items) => items.map((entry) => entry.id === id ? { ...entry, read: true } : entry));
    if (item?.source === "neighborhood" && user?.id) fetch(`/api/neighborhood/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }).catch(() => {});
  }, [updateSection, user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    async function refreshNeighborhoodNotifications() {
      try {
        const response = await fetch("/api/neighborhood/my", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!active || !Array.isArray(data.notifications)) return;
        const current = stateRef.current;
        const byId = new Map(current.notifications.map((item) => [item.id, item]));
        for (const item of data.notifications) byId.set(item.id, { ...byId.get(item.id), ...item });
        const next = { ...current, notifications: [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 300) };
        stateRef.current = next;
        setWorkspace(next);
        try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* The current session still shows the notifications. */ }
      } catch { /* Existing workspace notifications remain visible while offline. */ }
    }
    refreshNeighborhoodNotifications();
    const timer = window.setInterval(refreshNeighborhoodNotifications, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [user?.id, storageKey]);
  const value = useMemo(() => ({ workspace, loading, syncStatus, notice, setNotice, toggleFavorite, addNotification, addActivity, recordSearch, saveFilter, setLocation, addReview, sendMessage, markNotificationRead, updateSection }), [workspace, loading, syncStatus, notice, toggleFavorite, addNotification, addActivity, recordSearch, saveFilter, setLocation, addReview, sendMessage, markNotificationRead, updateSection]);

  useEffect(() => {
    const onActivity = (event) => addActivity(event.detail?.kind, event.detail?.record || {});
    window.addEventListener("mercora:workspace-activity", onActivity);
    return () => window.removeEventListener("mercora:workspace-activity", onActivity);
  }, [addActivity]);
  return <WorkspaceContext.Provider value={value}>{children}{notice && <div className="workspaceToast" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Закрыть сообщение">×</button></div>}</WorkspaceContext.Provider>;
}

export function useWorkspace() { const value = useContext(WorkspaceContext); if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider"); return value; }
export function dispatchWorkspaceActivity(kind, record) { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("mercora:workspace-activity", { detail: { kind, record } })); }

function normalizeWorkspace(value) { const cleanValue = { ...EMPTY, ...value }; cleanValue.location = { ...EMPTY.location, ...(value.location || {}) }; for (const key of SECTIONS) cleanValue[key] = Array.isArray(value[key]) ? value[key].slice(0, key === "favorites" ? 500 : 300) : []; return cleanValue; }
function mergeWorkspace(remote, local) { const result = { ...remote, location: local.location?.city && local.location.city !== "Aktau" ? local.location : remote.location }; for (const key of SECTIONS) { const byId = new Map(); [...(remote[key] || []), ...(local[key] || [])].forEach((item) => byId.set(typeof item === "string" ? item : item.id, item)); result[key] = [...byId.values()].slice(0, key === "favorites" ? 500 : 300); } return result; }
function readLegacyWorkspace() {
  const read = (key) => { try { const value = JSON.parse(window.localStorage.getItem(key) || "null"); return value; } catch { return null; } };
  const asList = (key, kind, fallbackTitle) => (Array.isArray(read(key)) ? read(key) : []).slice(0, 200).map((item, index) => ({ id: String(item.id || `${kind}-legacy-${index}`).slice(0, 160), listingId: clean(item.listingId, 160), title: clean(item.title || item.provider || item.category || fallbackTitle, 160), category: clean(item.category || kind, 40), status: clean(item.status || "saved-local", 40), preferredDate: clean(item.preferredDate || item.date, 20), preferredTime: clean(item.preferredTime || item.time, 12), createdAt: item.createdAt || item.submittedAt || new Date().toISOString() }));
  const favorites = read("mercora.discovery.favorites.v1");
  const serviceChats = read("mercora.services.chats.v1");
  const marketChats = read("mercora.marketplace.chats.v1");
  const chats = [serviceChats, marketChats].flatMap((source) => source && typeof source === "object" ? Object.entries(source).flatMap(([threadId, messages]) => Array.isArray(messages) ? messages.slice(-40).map((item, index) => ({ ...item, id: item.id || `${threadId}-${index}`, threadId, title: threadId })) : []) : []);
  return { ...EMPTY, favorites: Array.isArray(favorites) ? favorites.filter((item) => typeof item === "string") : [], bookings: [
    ...asList("mercora.education.lesson-requests.v1", "education", "Занятие"),
    ...asList("mercora.services.requests.v1", "service", "Услуга"),
    ...asList("mercora.places.booking-requests.v1", "place", "Запись")
  ], applications: asList("mercora.jobs.applications.v1", "job", "Отклик"), chats };
}
function clean(value, max) { return String(value ?? "").trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, max); }
function safeHref(value) { const path = String(value || ""); return path.startsWith("/") && !path.startsWith("//") ? path.slice(0, 240) : ""; }
function validCoordinates(value) { if (!value) return null; const lat = Number(value.lat); const lng = Number(value.lng); return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180 ? { lat, lng } : null; }
function makeId() { return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
