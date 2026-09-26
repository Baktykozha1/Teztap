"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Bookmark, MapPinned, Search, Sparkles } from "lucide-react";
import AktauMap from "../maps/aktau-map";
import { PlatformPageShell } from "../ui/platform-pages";
import { listings as allListings, geocodeAktau, loadGeographicListings, reverseGeocodeAktau } from "../../lib/discovery-data";
import { interpretDiscoveryRequest, matchesDiscoveryIntent, scoreListing } from "../../lib/discovery";
import { DiscoveryFilters, ListingCard, LocationSearch, TezTapAskPanel, useDiscoveryFavorites } from "./discovery-ui";
import { EducationCard, EducationFilters, LessonRequestDialog, matchesEducationFilters } from "./education-ui";
import { JobApplicationDialog, JobCard, JobDetailsDialog, JobFilters, JobsWorkspace, matchesJobFilters, useJobsLocalData } from "./jobs-ui";
import { matchesServiceFilters, ServiceCard, ServiceChatDialog, ServiceDetailsDialog, ServiceFilters, ServiceRequestDialog, ServicesWorkspace, useServiceRequests } from "./services-ui";
import { MarketplaceCard, MarketplaceChatDialog, MarketplaceCreateDialog, MarketplaceFilters, MarketplaceReportDialog, MarketplaceSafetyDialog, MarketplaceWorkspace, marketplaceCategoryForListing, saveMarketplaceReport, useMarketplaceListings } from "./marketplace-ui";
import { matchesPlaceFilters, PlaceBookingDialog, PlaceCard, placeKind, PlacesFilters, PlacesTopRecommendations } from "./places-ui";
import { useWorkspace } from "../workspace-provider";

const config = {
  education: { title: "Образование", subtitle: "Репетиторы, курсы, языковые школы, учебные центры и подготовка к экзаменам в Актау.", eyebrow: "Учитесь рядом", types: [{ key: "Tutors", label: "Репетиторы" }, { key: "Courses", label: "Курсы" }, { key: "Language schools", label: "Языковые школы" }, { key: "Educational centers", label: "Учебные центры" }, { key: "Exam prep", label: "Подготовка к экзаменам" }] },
  jobs: { title: "Работа", subtitle: "Полная и частичная занятость, временная работа, стажировки и вакансии без опыта в Актау.", eyebrow: "Работа рядом", types: [{ key: "Vacancies", label: "Вакансии" }, { key: "Full-time", label: "Полный день" }, { key: "Part-time", label: "Подработка" }, { key: "Temporary", label: "Временная" }, { key: "Internships", label: "Стажировки" }, { key: "Entry-level", label: "Без опыта" }] },
  services: { title: "Услуги рядом", subtitle: "Ремонт, сантехника, электрика, уборка, няни, фото, доставка и услуги красоты в Актау.", eyebrow: "Специалисты рядом", types: [{ key: "Repair specialists", label: "Ремонт" }, { key: "Plumbers", label: "Сантехники" }, { key: "Electricians", label: "Электрики" }, { key: "Cleaners", label: "Уборка" }, { key: "Babysitters", label: "Няни" }, { key: "Photographers", label: "Фотографы" }, { key: "Delivery", label: "Доставка" }, { key: "Beauty professionals", label: "Красота" }] },
  marketplace: { title: "Маркетплейс", subtitle: "Покупайте, продавайте и арендуйте вещи в Актау. Точный адрес частного продавца остаётся скрытым.", eyebrow: "Покупки рядом", types: [{ key: "Buy", label: "Продажа" }, { key: "Rent", label: "Аренда" }] },
  places: { title: "Места", subtitle: "Кафе, рестораны, клиники, аптеки, спортзалы, салоны, магазины и развлечения на карте Актау.", eyebrow: "Места на карте", types: [{ key: "Cafes", label: "\u041a\u0430\u0444\u0435" }, { key: "Restaurants", label: "Рестораны" }, { key: "Clinics", label: "Клиники" }, { key: "Pharmacies", label: "Аптеки" }, { key: "Gyms", label: "Спортзалы" }, { key: "Salons", label: "Салоны" }, { key: "Shops", label: "Магазины" }, { key: "Entertainment", label: "Развлечения" }, { key: "Other", label: "\u0414\u0440\u0443\u0433\u0438\u0435 \u043c\u0435\u0441\u0442\u0430" }] }
};

const categoryFilters = [{ key: "education", label: "Образование" }, { key: "jobs", label: "Работа" }, { key: "services", label: "Услуги рядом" }, { key: "marketplace", label: "Маркетплейс" }, { key: "places", label: "Места" }];
const mapResult = { input: { city: "Актау" }, market: { competitorCount: 0, map: { center: { lat: 43.6353, lng: 51.1682 } } }, competitors: [] };
const aktauCenter = { coordinates: { lat: 43.6353, lng: 51.1682 }, address: "Актау", districtId: null };
const noMapHighlights = [];

export default function DirectoryPage({ category, favoritesOnly = false, initialQuery = "", initialFocusId = "" }) {
  const section = config[category];
  const { ids, ready, toggle, isFavorite } = useDiscoveryFavorites();
  const { workspace, recordSearch, saveFilter, setLocation, setNotice } = useWorkspace();
  const [applications, setApplications] = useState([]);
  const [search, setSearch] = useState(initialQuery || (category === "education" ? "репетиторы и учебные центры" : ""));
  const [district, setDistrict] = useState("");
  const [type, setType] = useState("All");
  const [sort, setSort] = useState("recommended");
  const [mapFocus, setMapFocus] = useState(null);
  const [searchOrigin, setSearchOrigin] = useState(aktauCenter);
  const [radiusKm, setRadiusKm] = useState(category === "education" ? 25 : 10);
  const [mobileView, setMobileView] = useState("map");
  const [askQuery, setAskQuery] = useState("");
  const [requestIntent, setRequestIntent] = useState(null);
  const [educationFilters, setEducationFilters] = useState({ subject: "", format: "", lessonType: "", maxPrice: "", minRating: category === "education" ? "3.5" : "", date: "", time: "" });
  const [educationRequest, setEducationRequest] = useState(null);
  const [jobFilters, setJobFilters] = useState({ minSalary: "", maxSalary: "", employmentType: "", experience: "", schedule: "", workFormat: "" });
  const [jobApplication, setJobApplication] = useState(null);
  const [jobDetails, setJobDetails] = useState(null);
  const jobsLocal = useJobsLocalData();
  const [serviceFilters, setServiceFilters] = useState({ maxPrice: "", minRating: "", date: "", time: "", urgent: false });
  const [serviceRequest, setServiceRequest] = useState(null);
  const [serviceRequestLocation, setServiceRequestLocation] = useState(aktauCenter);
  const [serviceRequestDraft, setServiceRequestDraft] = useState({});
  const [serviceMapPickMode, setServiceMapPickMode] = useState(false);
  const [serviceChat, setServiceChat] = useState(null);
  const [serviceDetails, setServiceDetails] = useState(null);
  const serviceLocal = useServiceRequests();
  const marketplaceLocal = useMarketplaceListings();
  const [marketplaceFilters, setMarketplaceFilters] = useState({ category: "Все категории", minPrice: "", maxPrice: "", condition: "Любое состояние" });
  const [marketplaceCreateOpen, setMarketplaceCreateOpen] = useState(false);
  const [marketplaceChat, setMarketplaceChat] = useState(null);
  const [marketplaceReport, setMarketplaceReport] = useState(null);
  const [marketplaceSafety, setMarketplaceSafety] = useState(null);
  const [placesFilters, setPlacesFilters] = useState({ maxPriceLevel: "", minRating: "", openAt: "", openNow: false, bookingOnly: false });
  const [placeBooking, setPlaceBooking] = useState(null);
  const [placesNow, setPlacesNow] = useState(() => new Date());
  const [geographicListings, setGeographicListings] = useState([]);
  const [geoStatus, setGeoStatus] = useState("loading");
  const [geoPage, setGeoPage] = useState(1);
  const [geoHasMore, setGeoHasMore] = useState(false);
  const [geoMoreLoading, setGeoMoreLoading] = useState(false);
  const [geoSourceNote, setGeoSourceNote] = useState("Загружаем открытые и локальные геоданные…");
  const [educationPage, setEducationPage] = useState(1);
  const [educationTotal, setEducationTotal] = useState(0);
  const [educationHasMore, setEducationHasMore] = useState(false);
  const [educationMoreLoading, setEducationMoreLoading] = useState(false);
  const activeCategory = requestIntent?.category || category;
  const activeSection = config[activeCategory];
  const radiusLimit = requestIntent?.radiusKm ? Math.min(radiusKm, requestIntent.radiusKm) : radiusKm;
  const selectedPlacesType = activeCategory === "places" && type !== "All"
    ? config.places.types.find((option) => option.key === type)?.label || type
    : "";
  const geoQuery = String(requestIntent?.query || search || selectedPlacesType).trim();
  useEffect(() => {
    if (activeCategory !== "places") return undefined;
    const timer = window.setInterval(() => setPlacesNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [activeCategory]);
  useEffect(() => {
    if (!workspace.location) return;
    setRadiusKm(category === "education" && !workspace.location.coordinates ? 25 : Number(workspace.location.radiusKm) || 10);
    if (workspace.location.coordinates) setSearchOrigin({ coordinates: workspace.location.coordinates, address: workspace.location.address || "Сохранённое местоположение", districtId: null });
  }, [workspace.location]);
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("mercora.workspace.restore-filter.v1");
      if (!raw) return;
      window.sessionStorage.removeItem("mercora.workspace.restore-filter.v1");
      const saved = JSON.parse(raw);
      if (typeof saved.search === "string") setSearch(saved.search.slice(0, 160));
      if (typeof saved.district === "string") setDistrict(saved.district.slice(0, 100));
      if (typeof saved.type === "string") setType(saved.type.slice(0, 60));
      if (["recommended", "price", "distance", "rating"].includes(saved.sort)) setSort(saved.sort);
      if (Number.isFinite(Number(saved.radiusKm))) setRadiusKm(Math.min(25, Math.max(1, Number(saved.radiusKm))));
      if (saved.education) setEducationFilters((current) => ({ ...current, ...saved.education }));
      if (saved.jobs) setJobFilters((current) => ({ ...current, ...saved.jobs }));
      if (saved.services) setServiceFilters((current) => ({ ...current, ...saved.services }));
      if (saved.places) setPlacesFilters((current) => ({ ...current, ...saved.places }));
      if (saved.marketplace) setMarketplaceFilters((current) => ({ ...current, ...saved.marketplace }));
      setNotice("Сохранённый фильтр применён.");
    } catch { setNotice("Не удалось восстановить фильтр. Проверьте его параметры и сохраните заново."); }
  }, [setNotice]);
  useEffect(() => {
    const query = String(requestIntent?.query || search).trim();
    if (query.length < 3) return undefined;
    const timer = window.setTimeout(() => recordSearch({ query, category: activeCategory || "all", href: `${category ? `/${category}` : "/search"}?q=${encodeURIComponent(query)}` }), 650);
    return () => window.clearTimeout(timer);
  }, [search, requestIntent?.query, activeCategory, category, recordSearch]);
  useEffect(() => {
    if (activeCategory === "education") return undefined;
    if (activeCategory === "places" && !geoQuery) {
      setGeographicListings([]);
      setGeoPage(1);
      setGeoHasMore(false);
      setGeoSourceNote("Укажите тип заведения, чтобы запустить расширенный поиск 2ГИС по сетке 5×5.");
      setGeoStatus("ready");
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setGeoPage(1);
      setGeoHasMore(false);
      setGeoStatus("loading");
      try {
        const data = await loadGeographicListings({ category: activeCategory || "all", center: searchOrigin.coordinates, radiusKm: radiusLimit, query: geoQuery, signal: controller.signal });
        setGeographicListings(Array.isArray(data.items) ? data.items : []);
        setGeoPage(Number(data.page) || 1);
        setGeoHasMore(Boolean(data.hasMore));
        const sources = [...new Set((data.items || []).map((item) => item.sourceLabel).filter(Boolean))];
        if (data.sourceErrors?.twogis) setGeoSourceNote(`2ГИС не ответил: ${data.sourceErrors.twogis}. ${!(data.items || []).length ? "Показываем демонстрационные примеры TezTap." : "Показываем доступные источники."}`);
        if (!data.sourceErrors?.twogis) setGeoSourceNote(data.cache === "stale" ? `Внешний источник недоступен · показан сохранённый набор · ${sources.join(" · ")}` : data.cache === "hit" ? `Локальный кеш · ${sources.join(" · ")}` : sources.join(" · ") || "Нет результатов в доступных источниках");
        setGeoStatus(data.sourceErrors?.twogis && !(data.items || []).length ? "fallback" : "ready");
      } catch (error) {
        if (error.name === "AbortError") return;
        setGeographicListings([]);
        setGeoSourceNote("Внешний источник недоступен · показываем локальные демо-данные");
        setGeoStatus("fallback");
      }
    }, 900);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [activeCategory, searchOrigin, radiusLimit, geoQuery]);

  useEffect(() => {
    if (activeCategory !== "education") return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setGeoStatus("loading");
      setEducationPage(1);
      setEducationHasMore(false);
      try {
        const params = new URLSearchParams({ q: geoQuery || "репетиторы и учебные центры", page: "1" });
        const response = await fetch(`/api/education/2gis?${params}`, { signal: controller.signal, cache: "no-store", headers: { Accept: "application/json" } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Не удалось получить каталог 2ГИС.");
        const items = Array.isArray(data.items) ? data.items : [];
        setGeographicListings([...items, ...(data.userItems || [])]);
        setEducationPage(data.page || 1);
        setEducationTotal(Number(data.total || 0));
        setEducationHasMore(Boolean(data.hasMore));
        if (data.status === "failed") setGeoSourceNote(`2ГИС поиск не выполнен: ${(data.errors || []).join("; ") || "проверьте ключ Places API"}. Показываем демонстрационные примеры TezTap.`);
        else setGeoSourceNote(`Рейтинг 2ГИС от 3,5 · страница ${data.page} · найдено по запросу: ${Number(data.total || 0)}${data.hasMore ? " · можно загрузить ещё" : data.total > (data.pageLimit || 5) * (data.pageSize || 10) ? " · показан лимит демо-ключа" : ""}`);
        setGeoStatus(data.status === "failed" ? "fallback" : "ready");
      } catch (error) {
        if (error.name === "AbortError") return;
        setGeographicListings([]);
        setGeoSourceNote(error.message || "2ГИС временно не отвечает. Повторите поиск позже.");
        setGeoStatus("fallback");
      }
    }, 1000);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [activeCategory, geoQuery]);
  useEffect(() => {
    if (!searchOrigin.address || !["Выбранная точка, Актау", "Ваше местоположение"].includes(searchOrigin.address)) return undefined;
    const controller = new AbortController();
    reverseGeocodeAktau(searchOrigin.coordinates, controller.signal).then((place) => {
      setSearchOrigin((current) => current.coordinates.lat === searchOrigin.coordinates.lat && current.coordinates.lng === searchOrigin.coordinates.lng
        ? { ...current, address: place.address || current.address, districtId: place.districtId || current.districtId }
        : current);
    }).catch(() => {});
    return () => controller.abort();
  }, [searchOrigin]);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("mercora.discovery.demo-applications.v1") || "[]");
      setApplications(Array.isArray(saved) ? saved : []);
    } catch {
      setApplications([]);
    }
  }, []);
  function quickApply(id) {
    setApplications((current) => {
      const next = current.includes(id) ? current : [...current, id];
      window.localStorage.setItem("mercora.discovery.demo-applications.v1", JSON.stringify(next));
      return next;
    });
  }
  function handleTypeChange(nextType) {
    setType(nextType);
    if (activeCategory !== "education" || requestIntent) return;
    const searchTerms = {
      All: "репетиторы и учебные центры",
      Tutors: "репетиторы Актау",
      Courses: "учебные курсы Актау",
      "Language schools": "языковые школы Актау",
      "Educational centers": "учебные центры Актау",
      "Exam prep": "подготовка к экзаменам Актау"
    };
    setSearch(searchTerms[nextType] || searchTerms.All);
  }
  async function loadMoreGeographic() {
    if (!geoHasMore || geoMoreLoading) return;
    const nextPage = geoPage + 1;
    setGeoMoreLoading(true);
    try {
      const data = await loadGeographicListings({ category: activeCategory || "places", center: searchOrigin.coordinates, radiusKm: radiusLimit, query: geoQuery, page: nextPage });
      setGeographicListings((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of data.items || []) byId.set(item.id, item);
        return [...byId.values()];
      });
      setGeoPage(Number(data.page) || nextPage);
      setGeoHasMore(Boolean(data.hasMore));
      if (data.sourceErrors?.twogis) setGeoSourceNote(`2ГИС не ответил: ${data.sourceErrors.twogis}. Показываем доступные источники.`);
    } catch (error) {
      setGeoSourceNote(error.message || "Не удалось загрузить следующую страницу поиска.");
    } finally {
      setGeoMoreLoading(false);
    }
  }
  async function loadMoreEducation() {
    if (!educationHasMore || educationMoreLoading) return;
    const nextPage = educationPage + 1;
    setEducationMoreLoading(true);
    try {
      const params = new URLSearchParams({ q: geoQuery || "репетиторы и учебные центры", page: String(nextPage) });
      const response = await fetch(`/api/education/2gis?${params}`, { cache: "no-store", headers: { Accept: "application/json" } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить следующую страницу 2ГИС.");
      setGeographicListings((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of [...(data.items || []), ...(data.userItems || [])]) byId.set(item.id, item);
        return [...byId.values()];
      });
      setEducationPage(data.page || nextPage);
      setEducationTotal(Number(data.total || educationTotal));
      setEducationHasMore(Boolean(data.hasMore));
      setGeoSourceNote(`Рейтинг 2ГИС от 3,5 · загружена страница ${data.page} · всего по запросу ${Number(data.total || 0)}${data.hasMore ? " · можно загрузить ещё" : data.total > (data.pageLimit || 5) * (data.pageSize || 10) ? " · достигнут лимит демо-ключа" : ""}`);
    } catch (error) { setGeoSourceNote(error.message); }
    finally { setEducationMoreLoading(false); }
  }
  const source = useMemo(() => {
    const records = activeCategory === "education" ? geoStatus === "fallback"
      ? [...geographicListings, ...allListings.filter((item) => item.category === "education")]
      : geographicListings : activeCategory === "places"
      ? !geoQuery ? [] : geoStatus === "fallback"
        ? [...geographicListings, ...allListings.filter((item) => item.category === "places")]
        : geographicListings
      : geoStatus === "fallback" || !geographicListings.length ? allListings : geographicListings;
    const marketplaceRecords = activeCategory === "marketplace"
      ? [...records.filter((item) => item.category === "marketplace" && !String(item.id).startsWith("property-")), ...marketplaceLocal.localListings]
      : !activeCategory
        ? [...records, ...marketplaceLocal.localListings]
        : records;
    return marketplaceRecords.filter((item) => !activeCategory || item.category === activeCategory);
  }, [activeCategory, geoQuery, geographicListings, geoStatus, marketplaceLocal.localListings]);
  const visible = useMemo(() => {
    const query = `${search} ${district}`.trim().toLowerCase();
    const filtered = source.filter((item) => {
      const matchesFavorite = !favoritesOnly || (ready && ids.includes(item.id));
      const matchesType = type === "All" || (activeCategory === "places" ? placeKind(item) === type : ((favoritesOnly || !activeCategory) ? item.category === type : item.subtype === type)) || (activeCategory === "marketplace" && type === "Buy" && item.subtype === "Sell");
      const categoryName = config[item.category]?.title || item.category;
      const placeTypeName = item.category === "places" ? config.places.types.find((option) => option.key === placeKind(item))?.label || "" : "";
      const matchesQuery = !query || ((activeCategory === "places" || activeCategory === "education") && (item.source === "2gis" || (geoStatus === "fallback" && item.demo))) || `${item.title} ${item.provider} ${item.description} ${item.city} ${item.district} ${item.address || ""} ${item.subtype} ${item.subtypeLabel || ""} ${categoryName} ${placeTypeName} ${(item.education?.subjects || []).join(" ")} ${(item.tags || []).join(" ")}`.toLowerCase().includes(query);
      const scored = scoreListing(item, { center: searchOrigin.coordinates, radiusKm: radiusLimit });
      const matchesIntent = matchesDiscoveryIntent(item, requestIntent);
      const matchesEducation = activeCategory !== "education" || matchesEducationFilters(item, educationFilters);
      const matchesJob = activeCategory !== "jobs" || matchesJobFilters(item, jobFilters);
      const matchesService = activeCategory !== "services" || matchesServiceFilters(item, serviceFilters);
      const matchesPlaces = activeCategory !== "places" || matchesPlaceFilters(item, placesFilters, placesNow);
      const marketplace = item.marketplace || {};
      const matchesMarketplaceCategory = activeCategory !== "marketplace" || marketplaceFilters.category === "Все категории" || (marketplace.category || marketplaceCategoryForListing(item)) === marketplaceFilters.category;
      const matchesMarketplaceCondition = activeCategory !== "marketplace" || marketplaceFilters.condition === "Любое состояние" || (marketplace.condition || "Хорошее") === marketplaceFilters.condition;
      const price = Number(item.priceAmount);
      const matchesMarketplacePrice = activeCategory !== "marketplace" || ((marketplaceFilters.minPrice === "" || (Number.isFinite(price) && price >= Number(marketplaceFilters.minPrice))) && (marketplaceFilters.maxPrice === "" || (Number.isFinite(price) && price <= Number(marketplaceFilters.maxPrice))));
      return matchesFavorite && matchesType && matchesQuery && scored.eligibleForRecommendation && matchesIntent && matchesEducation && matchesJob && matchesService && matchesPlaces && matchesMarketplaceCategory && matchesMarketplaceCondition && matchesMarketplacePrice;
    });
    if (sort === "rating") return filtered.sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
    if (sort === "distance") return filtered.sort((a, b) => distanceBetween(searchOrigin.coordinates, a.coordinates) - distanceBetween(searchOrigin.coordinates, b.coordinates));
    if (sort === "price") return filtered.sort((a, b) => (a.priceAmount ?? Number.POSITIVE_INFINITY) - (b.priceAmount ?? Number.POSITIVE_INFINITY));
    return filtered.sort((a, b) => scoreListing(b, { center: searchOrigin.coordinates }).recommendationScore - scoreListing(a, { center: searchOrigin.coordinates }).recommendationScore);
  }, [source, favoritesOnly, ready, ids, type, activeCategory, search, district, sort, searchOrigin, radiusLimit, requestIntent, educationFilters, jobFilters, serviceFilters, marketplaceFilters, placesFilters, placesNow]);

  const serviceAlternativeCounts = useMemo(() => {
    if (activeCategory !== "services") return new Map();
    const counts = new Map();
    for (const item of visible) {
      const key = String(item.title || "").trim().toLocaleLowerCase("ru-RU");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [activeCategory, visible]);

  const topPlaces = useMemo(() => activeCategory === "places" ? visible.map((item) => scoreListing(item, { center: searchOrigin.coordinates, radiusKm: radiusLimit }))
    .sort((a, b) => b.recommendationScore - a.recommendationScore || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    .slice(0, 3) : noMapHighlights, [activeCategory, visible, searchOrigin, radiusLimit]);
  const topPlaceIds = useMemo(() => activeCategory === "places" ? topPlaces.map((item) => item.id) : noMapHighlights, [activeCategory, topPlaces]);

  useEffect(() => {
    if (!initialFocusId || mapFocus?.id === initialFocusId) return;
    const focused = visible.find((item) => item.id === initialFocusId);
    if (!focused) return;
    setMapFocus(focused);
    setMobileView("map");
    window.requestAnimationFrame(() => document.getElementById("directory-map")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [initialFocusId, mapFocus, visible]);

  const unpricedMatches = requestIntent?.budgetAmount == null ? 0 : source.filter((item) => {
    const withoutBudget = { ...requestIntent, budgetAmount: null };
    return matchesDiscoveryIntent(item, withoutBudget) && item.priceAmount == null && scoreListing(item, { center: searchOrigin.coordinates, radiusKm: radiusLimit }).eligibleForRecommendation;
  }).length;
  const overBudgetMatches = requestIntent?.budgetAmount == null ? 0 : source.filter((item) => {
    const withoutBudget = { ...requestIntent, budgetAmount: null };
    const aboveLimit = requestIntent.budgetInclusive === false ? Number(item.priceAmount) >= requestIntent.budgetAmount : Number(item.priceAmount) > requestIntent.budgetAmount;
    return matchesDiscoveryIntent(item, withoutBudget) && item.priceAmount != null && aboveLimit && scoreListing(item, { center: searchOrigin.coordinates, radiusKm: radiusLimit }).eligibleForRecommendation;
  }).length;

  function selectFromMap(listing) {
    setMapFocus(listing);
    setMobileView("list");
    window.requestAnimationFrame(() => document.getElementById(`listing-${listing.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }
  function focusListingOnMap(listing) {
    setMapFocus(listing);
    setMobileView("map");
  }
  function handleSearchOriginChange(location) {
    setSearchOrigin(location);
    setLocation({ ...workspace.location, city: workspace.location.city || "Aktau", radiusKm, coordinates: location.coordinates, address: location.address || "Выбранная точка" });
    if (serviceMapPickMode) {
      setServiceMapPickMode(false);
      setServiceRequestLocation(location);
      setGeoSourceNote("Точка заявки выбрана на общей карте");
    }
  }
  function beginServiceRequest(listing = null, mode = "new") {
    setServiceRequestLocation(searchOrigin);
    setServiceRequestDraft({});
    setServiceRequest({ listing, mode });
  }
  function chooseServicePointOnMap(draft = {}) {
    setServiceMapPickMode(true);
    setServiceRequestDraft(draft);
    setMobileView("map");
    setGeoSourceNote("Нажмите на карте, чтобы выбрать место оказания услуги");
  }
  async function selectAddressOnMap(query) {
    try {
      const found = await geocodeAktau(query);
      if (!found?.coordinates) throw new Error("not found");
      setSearchOrigin({ coordinates: found.coordinates, address: found.address, districtId: null });
      setLocation({ ...workspace.location, city: workspace.location.city || "Aktau", radiusKm, coordinates: found.coordinates, address: found.address || query });
      setDistrict("");
    } catch {
      setGeoSourceNote("Адрес не найден или Nominatim временно недоступен · карта остаётся доступной");
    }
  }
  function submitTezTapRequest(event) {
    event.preventDefault();
    const parsed = interpretDiscoveryRequest(askQuery);
    setRequestIntent(parsed);
    setType("All");
    setMapFocus(null);
    if (parsed.nearMe) setMobileView("map");
    if (parsed.district) setDistrict(parsed.district);
    if (parsed.preferLowPrice) setSort("price");
    else setSort("recommended");
  }
  function clearTezTapRequest() {
    setAskQuery("");
    setRequestIntent(null);
    setDistrict("");
    setType("All");
    setSort("recommended");
  }
  useEffect(() => {
    if (mapFocus?.id && !visible.some((item) => item.id === mapFocus.id)) setMapFocus(null);
  }, [mapFocus, visible]);

  const title = favoritesOnly ? "Избранное" : requestIntent?.category ? config[requestIntent.category]?.title || section?.title : section?.title || "Поиск по Актау";
  const subtitle = favoritesOnly ? "Сохранённые курсы, вакансии, услуги, товары и места." : section?.subtitle || "Ищите по всем каталогам TezTap в Актау.";
  const categories = favoritesOnly || !activeCategory ? categoryFilters : activeSection.types;
  const categoryForFilter = favoritesOnly ? null : category;
  const interpretedLabel = requestIntent ? `Поняла запрос${requestIntent.category ? ` · ${config[requestIntent.category]?.title}` : ""}${requestIntent.budgetAmount != null ? ` · ${requestIntent.budgetInclusive === false ? "менее" : "до"} ${requestIntent.budgetAmount.toLocaleString("ru-RU")} ₸` : ""}${requestIntent.district ? ` · ${requestIntent.district}` : ""}${requestIntent.radiusKm ? ` · радиус запроса ${requestIntent.radiusKm} км` : ""}${requestIntent.nearMe ? " · запрашиваю вашу геолокацию" : ""}` : "";
  const aiDiscoveryContext = {
    request: askQuery,
    category: activeCategory || "all",
    center: searchOrigin.coordinates,
    radiusKm: radiusLimit,
    filters: { query: search, type, education: educationFilters, jobs: jobFilters, services: serviceFilters, marketplace: marketplaceFilters, places: placesFilters },
    records: visible.slice(0, 8).map((listing) => {
      const scored = scoreListing(listing, { center: searchOrigin.coordinates, radiusKm: radiusLimit });
      return { id: listing.id, category: listing.category, title: listing.title, description: listing.description, district: listing.district, address: listing.address, distanceKm: scored.distanceKm, priceAmount: listing.priceAmount ?? null, priceLabel: listing.priceLabel, currency: listing.currency || "KZT", rating: listing.rating ?? null, ratingCount: listing.ratingCount ?? null, recommendationScore: scored.recommendationScore, topRank: topPlaceIds.indexOf(listing.id) >= 0 ? topPlaceIds.indexOf(listing.id) + 1 : null, factors: scored.recommendationFactors, availabilityStatus: listing.availabilityStatus || "unknown", available: listing.available ?? null, source: listing.source, sourceLabel: listing.sourceLabel, education: listing.education, job: listing.job, jobMatch: listing.jobMatch, service: listing.service, marketplace: listing.marketplace, place: listing.place, openingHours: listing.openingHours, demo: listing.demo === true };
    })
  };

  return (
    <PlatformPageShell eyebrow={favoritesOnly ? "Ваши сохранения" : section?.eyebrow || "Поиск TezTap"} title={title} subtitle={subtitle}>
      <section className="directoryIntroCard"><div><span>Актау · демонстрационный каталог</span><p>Примеры объявлений помечены как демо до подключения проверенных данных. TezTap оценивает соответствие по рейтингу, отзывам, категории и расстоянию.</p></div><a href="/map"><MapPinned size={16} /> Открыть умную карту <ArrowRight size={15} /></a></section>
      {!category && !favoritesOnly && <Link className="searchTezTapCard" href="/analyze"><span><Sparkles size={18} /></span><div><strong>TezTap · анализ и рекомендации</strong><small>Оцените бизнес-идею, рынок и районы Актау с помощью исходной системы TezTap.</small></div><ArrowRight size={17} /></Link>}
      <TezTapAskPanel value={askQuery} onChange={setAskQuery} onSubmit={submitTezTapRequest} onClear={clearTezTapRequest} handoffUrl={`/analyze?mercoraPrompt=${encodeURIComponent(askQuery || "Подбери подходящий вариант рядом в Актау и объясни рекомендацию.")}#mercora-ai`} discoveryContext={aiDiscoveryContext} interpretedLabel={interpretedLabel} />
      {requestIntent?.requiresToday && <p className="mercoraEvidenceNotice">В каталоге нет подтверждения свободной записи именно сегодня. Уточните наличие у исполнителя перед заказом.</p>}
      {requestIntent?.requestedHourAfter != null && <p className="mercoraEvidenceNotice">Часы работы после {requestIntent.requestedHourAfter}:00 не указаны в проверенных данных; время работы нужно уточнить у места.</p>}
      {unpricedMatches > 0 && <p className="mercoraEvidenceNotice">У {unpricedMatches} подходящих объектов цена неизвестна, поэтому они не включены в точную выборку по бюджету.</p>}
      {overBudgetMatches > 0 && visible.length === 0 && <p className="mercoraEvidenceNotice">Есть совпадения по запросу, но их известная цена выше указанного предела.</p>}
      <section className="directoryToolbar"><label className="searchField"><Search size={17} /><span className="srOnly">Поиск объявлений</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Название, услуга или ключевое слово" /></label><LocationSearch value={district} onChange={setDistrict} onLocationSelect={selectAddressOnMap} /></section>
      <div className="mapRadiusToolbar"><label htmlFor="aktau-search-radius">Радиус поиска <strong>{radiusKm} км</strong></label><input id="aktau-search-radius" type="range" min="1" max="25" step="1" value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))} /><span>от точки: {searchOrigin.address}</span></div>
      <p className="geoSourceNote" role="status">{activeCategory === "education" && <><a href="https://2gis.kz/aktau" target="_blank" rel="noreferrer">Данные предоставлены 2ГИС</a> · </>}{geoSourceNote} · © OpenStreetMap contributors</p>
      <DiscoveryFilters types={categories} selectedType={type} onTypeChange={handleTypeChange} sort={sort} onSortChange={setSort} />
      {activeCategory === "places" && geoHasMore && <button type="button" className="educationLoadMore" disabled={geoMoreLoading} onClick={loadMoreGeographic}>{geoMoreLoading ? "Загружаем из 2ГИС…" : `Показать ещё · страница ${geoPage + 1} из 5`}</button>}
      {activeCategory === "education" && <EducationFilters listings={source} value={educationFilters} onChange={setEducationFilters} />}
      {activeCategory === "education" && educationHasMore && <button type="button" className="educationLoadMore" disabled={educationMoreLoading} onClick={loadMoreEducation}>{educationMoreLoading ? "Загружаем из 2ГИС…" : `Показать ещё · страница ${educationPage + 1} из 5`}</button>}
      {activeCategory === "jobs" && <><JobsWorkspace profile={jobsLocal.profile} onSaveProfile={jobsLocal.saveProfile} applications={jobsLocal.applications} onUpdateApplication={jobsLocal.updateApplicationStatus} /><JobFilters value={jobFilters} onChange={setJobFilters} /></>}
      {activeCategory === "services" && <><ServicesWorkspace requests={serviceLocal.requests} onNewRequest={() => beginServiceRequest()} /><ServiceFilters value={serviceFilters} onChange={setServiceFilters} />{serviceMapPickMode && <p className="serviceMapPickNotice" role="status">Нажмите на карте, чтобы выбрать место оказания услуги. <button type="button" onClick={() => setServiceMapPickMode(false)}>Отменить выбор</button></p>}</>}
      {activeCategory === "marketplace" && <><MarketplaceWorkspace count={visible.length} onCreate={() => setMarketplaceCreateOpen(true)} /><MarketplaceFilters value={marketplaceFilters} onChange={setMarketplaceFilters} /></>}
      {activeCategory === "places" && <PlacesFilters value={placesFilters} onChange={setPlacesFilters} />}
      {activeCategory === "places" && <PlacesTopRecommendations items={topPlaces} onViewOnMap={focusListingOnMap} />}
      <div className="mobileMapMode" role="group" aria-label="Режим отображения результатов"><button type="button" className={mobileView === "list" ? "active" : ""} onClick={() => setMobileView("list")}>Список</button><button type="button" className={mobileView === "map" ? "active" : ""} onClick={() => setMobileView("map")}>Карта</button></div>
      <div className="directoryResultsHeading"><div><span>{favoritesOnly ? "Ваш список" : requestIntent ? "Рекомендации TezTap" : activeCategory === "jobs" ? "HeadHunter · примеры TezTap" : activeCategory === "services" ? "OLX · примеры TezTap" : "Объявления Актау"}</span><h2>{visible.length} {visible.length === 1 ? "результат" : "результатов"}</h2></div><p><strong>Оценка TezTap</strong> учитывает рейтинг, количество отзывов, категорию и расстояние. Цена и доступность выводятся отдельно.</p>{!favoritesOnly && <button type="button" className="saveDirectoryFilter" onClick={() => saveFilter({ label: `${activeSection?.title || "Поиск"}${search ? ` · ${search}` : ""}`, category: activeCategory || "all", href: `${category ? `/${category}` : "/search"}${search ? `?q=${encodeURIComponent(search)}` : ""}`, state: { search, district, type, sort, radiusKm: radiusLimit, education: educationFilters, jobs: jobFilters, services: serviceFilters, marketplace: marketplaceFilters, places: placesFilters } })}><Bookmark size={15} /> Сохранить фильтр</button>}</div>
      <section className={`directoryGrid ${mobileView === "map" ? "mapMode" : "listMode"} ${activeCategory === "places" ? "placesMapFirst" : ""}`}>
        <div className="directoryList">{visible.length ? visible.map((item) => activeCategory === "education"
          ? <EducationCard id={`listing-${item.id}`} key={item.id} listing={item} favorite={isFavorite(item.id)} onToggleFavorite={toggle} onViewOnMap={focusListingOnMap} onRequest={(listing, mode) => setEducationRequest({ listing, mode })} selected={mapFocus?.id === item.id} scoreContext={{ center: searchOrigin.coordinates, radiusKm: radiusLimit }} />
          : activeCategory === "jobs"
            ? <JobCard key={item.id} listing={item} profile={jobsLocal.profile} favorite={isFavorite(item.id)} onToggleFavorite={toggle} onViewOnMap={focusListingOnMap} onApply={setJobApplication} onDetails={(listing, tab) => setJobDetails({ listing, tab })} application={jobsLocal.applications.find((application) => application.listingId === item.id)} selected={mapFocus?.id === item.id} scoreContext={{ center: searchOrigin.coordinates, radiusKm: radiusLimit }} />
            : activeCategory === "services"
              ? <ServiceCard key={item.id} listing={item} alternatives={serviceAlternativeCounts.get(String(item.title || "").trim().toLocaleLowerCase("ru-RU")) || 1} favorite={isFavorite(item.id)} onToggleFavorite={toggle} onViewOnMap={focusListingOnMap} onRequest={({ listing, mode }) => beginServiceRequest(listing, mode)} onChat={setServiceChat} onDetails={setServiceDetails} selected={mapFocus?.id === item.id} scoreContext={{ center: searchOrigin.coordinates, radiusKm: radiusLimit }} />
            : activeCategory === "marketplace" || (favoritesOnly && item.category === "marketplace")
              ? <MarketplaceCard key={item.id} listing={item} favorite={isFavorite(item.id)} onToggleFavorite={toggle} onViewOnMap={focusListingOnMap} onChat={setMarketplaceChat} onReport={setMarketplaceReport} onSafety={setMarketplaceSafety} selected={mapFocus?.id === item.id} scoreContext={{ center: searchOrigin.coordinates, radiusKm: radiusLimit }} />
            : activeCategory === "places" || (favoritesOnly && item.category === "places")
              ? <PlaceCard key={item.id} listing={item} rank={topPlaceIds.indexOf(item.id) + 1 || null} favorite={isFavorite(item.id)} onToggleFavorite={toggle} onViewOnMap={focusListingOnMap} onBook={setPlaceBooking} selected={mapFocus?.id === item.id} scoreContext={{ center: searchOrigin.coordinates, radiusKm: radiusLimit }} now={placesNow} />
            : <ListingCard id={`listing-${item.id}`} key={item.id} listing={item} favorite={isFavorite(item.id)} onToggleFavorite={toggle} onViewOnMap={focusListingOnMap} applied={applications.includes(item.id)} onQuickApply={quickApply} selected={mapFocus?.id === item.id} scoreContext={{ center: searchOrigin.coordinates, radiusKm: radiusLimit }} />) : <div className="directoryEmpty"><Search size={23} /><h3>{favoritesOnly ? "Пока нет избранного" : "Ничего не найдено"}</h3><p>{favoritesOnly ? "Нажмите на сердечко в карточке, чтобы сохранить её." : "Попробуйте изменить запрос, район или увеличить радиус."}</p></div>}</div>
        <div id="directory-map" className="directoryMap"><div className="directoryMapHeading"><div><span>Общая карта TezTap</span><h3>{serviceMapPickMode ? "Выберите место оказания услуги" : activeCategory === "places" ? "Места Актау · лучшие варианты отмечены 1–3" : "Найдите рядом в Актау"}</h3></div><MapPinned size={18} /></div><AktauMap result={mapResult} listings={visible} highlightedListingIds={topPlaceIds} searchOrigin={searchOrigin} onSearchOriginChange={handleSearchOriginChange} radiusKm={radiusLimit} autoLocateKey={requestIntent?.nearMe ? requestIntent.query : null} isVisible={mobileView === "map"} selectedLocation={mapFocus ? { coordinates: mapFocus.coordinates, address: mapFocus.address, districtId: mapFocus.district } : null} selectedListingId={mapFocus?.id || null} onListingSelect={selectFromMap} /></div>
      </section>
      {activeCategory === "jobs" && <p className="directoryDisclosure">Упоминание HeadHunter — только пример оформления, а не источник данных: эти вакансии не публиковались и не проверялись на HeadHunter. Это демонстрационные примеры TezTap; отклик сохраняется только на этом устройстве и работодателю не отправляется.</p>}
      {activeCategory === "services" && <p className="directoryDisclosure">Упоминание OLX — только пример оформления, а не источник данных. Карточки с пометкой «OLX · пример TezTap» — демонстрационные примеры. Чат и заявка сохраняются только на этом устройстве и не отправляются исполнителю.</p>}
      <LessonRequestDialog listing={educationRequest?.listing} mode={educationRequest?.mode} onClose={() => setEducationRequest(null)} />
      <JobApplicationDialog listing={jobApplication} profile={jobsLocal.profile} previousApplication={jobsLocal.applications.find((application) => application.listingId === jobApplication?.id)} onClose={() => setJobApplication(null)} onSubmit={jobsLocal.saveApplication} />
      <JobDetailsDialog listing={jobDetails?.listing} tab={jobDetails?.tab} onTabChange={(tab) => setJobDetails((current) => current ? { ...current, tab } : current)} onClose={() => setJobDetails(null)} onViewOnMap={(listing) => { focusListingOnMap(listing); setJobDetails(null); }} profile={jobsLocal.profile} scoreContext={{ center: searchOrigin.coordinates, radiusKm: radiusLimit }} />
      <ServiceRequestDialog listing={serviceMapPickMode ? null : serviceRequest?.listing} mode={serviceMapPickMode ? null : serviceRequest?.mode} location={serviceRequestLocation} draft={serviceRequestDraft} onClose={() => setServiceRequest(null)} onChooseMap={chooseServicePointOnMap} onSave={serviceLocal.saveRequest} />
      <ServiceChatDialog listing={serviceChat} onClose={() => setServiceChat(null)} />
      <ServiceDetailsDialog listing={serviceDetails} onClose={() => setServiceDetails(null)} onRequest={({ listing, mode }) => { setServiceDetails(null); beginServiceRequest(listing, mode); }} onChat={(listing) => { setServiceDetails(null); setServiceChat(listing); }} />
      {marketplaceCreateOpen && <MarketplaceCreateDialog onClose={() => setMarketplaceCreateOpen(false)} onSave={marketplaceLocal.createListing} />}
      <MarketplaceChatDialog listing={marketplaceChat} onClose={() => setMarketplaceChat(null)} />
      <MarketplaceReportDialog listing={marketplaceReport} onClose={() => setMarketplaceReport(null)} onSubmit={saveMarketplaceReport} />
      <MarketplaceSafetyDialog listing={marketplaceSafety} onClose={() => setMarketplaceSafety(null)} />
      <PlaceBookingDialog listing={placeBooking} onClose={() => setPlaceBooking(null)} />
      {favoritesOnly && !categoryForFilter ? <p className="directoryFootnote">Избранное хранится в этом браузере на устройстве.</p> : null}
      {applications.length > 0 ? <p className="directoryFootnote">Демо-отклик сохранён на этом устройстве. Работодатель не получал сообщение.</p> : null}
    </PlatformPageShell>
  );
}

function distanceBetween(left, right) { return scoreListing({ coordinates: right }, { center: left }).distanceKm; }
