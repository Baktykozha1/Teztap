"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, CalendarDays, GraduationCap, MapPin, MessageCircle, UserRound } from "lucide-react";
import { FavoriteButton, RatingAndReviews, useDiscoveryFavorites } from "./discovery-ui";
import { scoreListing } from "../../lib/discovery";
import { dispatchWorkspaceActivity } from "../workspace-provider";

const EDUCATION_REQUESTS_KEY = "mercora.education.lesson-requests.v1";
const formatLabels = { online: "Онлайн", offline: "Очно", hybrid: "Онлайн и очно" };
const lessonLabels = { individual: "Индивидуально", group: "В группе" };
const categoryLabels = { school: "Школа · OSM", college: "Колледж · OSM", university: "Вуз · OSM", language_school: "Языковая школа · OSM", music_school: "Музыкальная школа · OSM", driving_school: "Автошкола · OSM", educational_institution: "Учебный центр · OSM", childcare: "Дошкольный центр · OSM" };
const dayLabels = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];

export function EducationFilters({ listings, value, onChange }) {
  const subjects = useMemo(() => [...new Set(listings.flatMap((item) => item.education?.subjects || []))].sort((a, b) => a.localeCompare(b, "ru")), [listings]);
  function update(key, next) { onChange((current) => ({ ...current, [key]: next })); }
  return (
    <section className="educationFilters" aria-label="Фильтры обучения">
      <label>Предмет<select value={value.subject} onChange={(event) => update("subject", event.target.value)}><option value="">Любой предмет</option>{subjects.map((subject) => <option key={subject}>{subject}</option>)}</select></label>
      <label>Формат<select value={value.format} onChange={(event) => update("format", event.target.value)}><option value="">Любой</option><option value="online">Онлайн</option><option value="offline">Очно</option><option value="hybrid">Онлайн и очно</option></select></label>
      <label>Занятия<select value={value.lessonType} onChange={(event) => update("lessonType", event.target.value)}><option value="">Любой формат</option><option value="individual">Индивидуальные</option><option value="group">Групповые</option></select></label>
      <label>Цена до, ₸<input inputMode="numeric" type="number" min="0" value={value.maxPrice} onChange={(event) => update("maxPrice", event.target.value)} placeholder="Любая" /></label>
      <label>Рейтинг от<select value={value.minRating} onChange={(event) => update("minRating", event.target.value)}><option value="">Любой</option><option value="3.5">3.5+</option><option value="4">4.0+</option><option value="4.5">4.5+</option><option value="4.8">4.8+</option></select></label>
      <label>Доступность по дате<input type="date" value={value.date} onChange={(event) => update("date", event.target.value)} /></label>
      <label>Время занятия<input type="time" value={value.time} onChange={(event) => update("time", event.target.value)} /></label>
      <button type="button" onClick={() => onChange({ subject: "", format: "", lessonType: "", maxPrice: "", minRating: "3.5", date: "", time: "" })}>Сбросить</button>
    </section>
  );
}

export function matchesEducationFilters(listing, filters) {
  const education = listing.education;
  if (!education) return !filters.subject && !filters.format && !filters.lessonType && !filters.maxPrice && !filters.minRating && !filters.date && !filters.time;
  if (filters.subject && !(education.subjects || []).includes(filters.subject)) return false;
  if (filters.format && education.format !== filters.format && !(education.format === "hybrid" && filters.format !== "")) return false;
  if (filters.lessonType && education.lessonType !== filters.lessonType) return false;
  if (filters.maxPrice && (listing.priceAmount == null || listing.priceAmount > Number(filters.maxPrice))) return false;
  if (filters.minRating && (listing.rating == null || listing.rating < Number(filters.minRating))) return false;
  const slots = education.schedule || [];
  const requestedDay = filters.date ? new Date(`${filters.date}T12:00:00`).getDay() : null;
  if ((filters.date || filters.time) && !slots.some((slot) => (requestedDay == null || slot.day === requestedDay) && (!filters.time || (filters.time >= slot.from && filters.time <= slot.to)))) return false;
  return true;
}

export function EducationCard({ listing, favorite, onToggleFavorite, onViewOnMap, onRequest, selected = false, scoreContext }) {
  const education = listing.education || {};
  const contactHref = getContactHref(listing);
  return (
    <article id={`listing-${listing.id}`} className={`educationCard ${selected ? "selected" : ""}`} aria-current={selected ? "true" : undefined}>
      <div className="educationCardTop"><span className={listing.demo ? "demoBadge" : "educationSourceBadge"}>{listing.demo ? "ДЕМО-ПРОФИЛЬ · НЕ ПРОВЕРЕНО" : listing.sourceLabel || "Публичные данные"}</span><FavoriteButton active={favorite} onClick={() => onToggleFavorite(listing.id)} /></div>
      <div className="educationCardHeading">
        <div className="educationAvatar" aria-label="Фото профиля не предоставлено"><UserRound size={27} /><span>Фото не добавлено</span></div>
        <div className="educationCardIdentity"><span>{listing.subtypeLabel || education.category || categoryLabels[listing.subtype] || listing.subtype}</span><h3>{listing.title}</h3><p>{education.instructor || listing.provider}</p></div>
        <div className="educationRating"><strong>{listing.rating == null ? "—" : Number(listing.rating).toFixed(1)}</strong><small>{listing.ratingCount == null ? "отзывы неизвестны" : `${listing.ratingCount} ${listing.demo ? "демо-отзывов" : "отзывов"}`}</small></div>
      </div>
      <div className="educationSubjects"><strong>Предметы</strong>{education.subjects?.length ? education.subjects.map((subject) => <span key={subject}>{subject}</span>) : <small>Не указаны в открытых данных</small>}</div>
      <div className="educationFacts"><p><GraduationCap size={15} /><span>{education.qualifications || "Квалификация не указана"}</span></p><p><BookOpen size={15} /><span>{education.experienceYears == null ? "Опыт не указан" : `${education.experienceYears} лет опыта${listing.demo ? " · пример" : ""}`}</span></p><p><span className="educationFactGlyph">↗</span><span>{formatLabels[education.format] || "Формат не указан"} · {lessonLabels[education.lessonType] || "тип урока не указан"}</span></p></div>
      <div className="educationSchedule"><CalendarDays size={15} /><div><strong>{scheduleLabel(education.schedule)}</strong><small>{education.availabilityNote || "Дату и время подтвердите перед записью."}{education.durationMinutes ? ` · ${education.durationMinutes} мин.` : ""}</small></div></div>
      <div className="educationCardFooter"><div><strong>{listing.priceLabel || "Цена не указана"}</strong><span><MapPin size={14} />{listing.address || listing.district || "Расположение не указано"}</span><small>{scoreListing(listing, scoreContext).distanceKm == null ? "Расстояние неизвестно" : `${scoreListing(listing, scoreContext).distanceKm.toFixed(1)} км от точки поиска`}</small></div><RatingAndReviews rating={listing.rating} count={listing.ratingCount} summary={listing.reviewSummary || "Подтверждённых отзывов нет."} demo={listing.demo} /></div>
      <div className="educationActions">
        {listing.source === "2gis" && listing.sourceUrl
          ? <a href={listing.sourceUrl} className="educationPrimaryAction" target="_blank" rel="noreferrer">Открыть профиль 2ГИС</a>
          : <Link href={`/education/${encodeURIComponent(listing.id)}`} className="educationPrimaryAction">Открыть профиль</Link>}
        <button type="button" onClick={() => onRequest(listing, "contact")}>Связаться</button>
        <button type="button" onClick={() => onRequest(listing, "lesson")}>Запросить занятие</button>
        <Link href="#directory-map" onClick={() => onViewOnMap(listing)}><MapPin size={14} /> На карте</Link>
        {contactHref && <a href={contactHref} target={contactHref.startsWith("https:") ? "_blank" : undefined} rel={contactHref.startsWith("https:") ? "noreferrer" : undefined} aria-label="Открыть опубликованный контакт">Контакт</a>}
        <TezTapEducationLink listing={listing} scoreContext={scoreContext} />
      </div>
    </article>
  );
}

export function LessonRequestDialog({ listing, mode, onClose }) {
  const [savedRequestKey, setSavedRequestKey] = useState("");
  const [saveErrorState, setSaveErrorState] = useState({ key: "", message: "" });
  const requestKey = `${listing?.id || ""}:${mode || ""}`;
  const saved = savedRequestKey === requestKey;
  const saveError = saveErrorState.key === requestKey ? saveErrorState.message : "";
  useEffect(() => {
    if (!listing) return undefined;
    function onKey(event) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listing, onClose]);
  if (!listing) return null;
  const title = mode === "contact" ? "Связаться" : "Запросить занятие";
  function saveRequest(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const request = { id: `edu-request-${Date.now()}`, listingId: listing.id, provider: listing.provider, mode, name: form.get("name"), contact: form.get("contact"), subject: form.get("subject"), date: form.get("date"), time: form.get("time"), message: form.get("message"), createdAt: new Date().toISOString(), demo: listing.demo === true, status: "saved-on-device" };
    try {
      const current = JSON.parse(window.localStorage.getItem(EDUCATION_REQUESTS_KEY) || "[]");
      window.localStorage.setItem(EDUCATION_REQUESTS_KEY, JSON.stringify([request, ...(Array.isArray(current) ? current : [])].slice(0, 50)));
      dispatchWorkspaceActivity("booking", { id: request.id, title: listing.title, provider: listing.provider, category: "education", preferredDate: request.date, preferredTime: request.time, status: "saved-on-device", demo: request.demo });
      setSavedRequestKey(requestKey);
    } catch {
      setSaveErrorState({ key: requestKey, message: "Не удалось сохранить в этом браузере. Проверьте свободное место или настройки приватности." });
    }
  }
  return (
    <div className="educationDialogBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="educationRequestDialog" role="dialog" aria-modal="true" aria-labelledby="education-request-title">
        <button className="educationDialogClose" type="button" onClick={onClose} aria-label="Закрыть">×</button>
        <span className="educationEyebrow">{listing.demo ? "ДЕМО-ПРОФИЛЬ" : listing.sourceLabel}</span><h2 id="education-request-title">{saved ? "Запрос сохранён" : title}</h2>
        {saved ? <div className="educationSavedState"><MessageCircle size={22} /><p>Запрос сохранён в TezTap на этом устройстве. Преподаватель его не получил. Запись доступна в профиле в разделе «История».</p><Link className="educationSavedLink" href="/profile">Открыть профиль</Link><button type="button" onClick={onClose}>Вернуться к вариантам</button></div> : <>
          <p className="educationDialogProvider">{listing.title} · {listing.provider}</p>
          <form className="educationRequestForm" onSubmit={saveRequest}>
            <label>Ваше имя<input name="name" required maxLength="80" /></label>
            <label>Телефон или e-mail<input name="contact" required maxLength="120" /></label>
            <label>Предмет<input name="subject" defaultValue={listing.education?.subjects?.[0] || ""} maxLength="100" /></label>
            <div className="educationDateTime"><label>Желаемая дата<input type="date" name="date" min={new Date().toISOString().slice(0, 10)} required /></label><label>Время<input type="time" name="time" required /></label></div>
            <label>Сообщение<textarea name="message" rows="3" maxLength="600" placeholder="Уровень подготовки, пожелания к формату…" /></label>
            <p className="educationLocalOnly">Это демонстрационная форма: она сохранит черновик в браузере и не отправит сообщение.</p>
            {saveError && <p className="educationLocalOnly" role="alert">{saveError}</p>}
            <button type="submit">Сохранить запрос на устройстве</button>
          </form>
        </>}
      </section>
    </div>
  );
}

export function EducationProfile({ id, initialListing = null, listings = [] }) {
  const [listing, setListing] = useState(initialListing || listings.find((item) => item.id === id) || null);
  const [loading, setLoading] = useState(!listing);
  const [request, setRequest] = useState(null);
  const { isFavorite, toggle } = useDiscoveryFavorites();
  useEffect(() => {
    const existing = initialListing || listings.find((item) => item.id === id);
    if (existing) { setListing(existing); setLoading(false); return undefined; }
    const controller = new AbortController();
    fetch(`/api/discovery?category=education&lat=43.6353&lng=51.1682&radiusKm=25`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json();
      setListing(data.items?.find((item) => item.id === id) || null);
    }).catch(() => setListing(null)).finally(() => setLoading(false));
    return () => controller.abort();
  }, [id, initialListing, listings]);
  if (loading) return <main className="educationProfilePage"><p>Загружаем профиль…</p></main>;
  if (!listing) return <main className="educationProfilePage"><Link href="/education"><ArrowLeft size={15} /> К списку обучения</Link><h1>Профиль не найден</h1><p>Он мог исчезнуть из доступного каталога. Откройте список и выберите другой вариант.</p></main>;
  const education = listing.education || {};
  const contactHref = getContactHref(listing);
  return (
    <main className="educationProfilePage">
      <Link className="educationBackLink" href="/education"><ArrowLeft size={15} /> К списку обучения</Link>
      <section className="educationProfileCard">
        <div className="educationProfileTop"><span className={listing.demo ? "demoBadge" : "educationSourceBadge"}>{listing.demo ? "ДЕМО-ПРОФИЛЬ · НЕ ПРОВЕРЕНО" : listing.sourceLabel}</span><FavoriteButton active={isFavorite(listing.id)} onClick={() => toggle(listing.id)} /></div>
        <div className="educationProfileHero"><div className="educationAvatar educationAvatarLarge"><UserRound size={44} /><span>Фото не предоставлено</span></div><div><span className="educationEyebrow">{listing.subtypeLabel || education.category || categoryLabels[listing.subtype] || listing.subtype}</span><h1>{listing.title}</h1><p>{education.instructor || listing.provider}</p><RatingAndReviews rating={listing.rating} count={listing.ratingCount} summary={listing.reviewSummary} demo={listing.demo} /></div></div>
        <p className="educationProfileDescription">{listing.description}</p>
        <div className="educationProfileGrid">
          <article><strong>Предметы</strong><p>{education.subjects?.join(" · ") || "Не указаны в открытых данных"}</p></article>
          <article><strong>Квалификация</strong><p>{education.qualifications || "Не указана"}</p></article>
          <article><strong>Опыт</strong><p>{education.experienceYears == null ? "Не указан" : `${education.experienceYears} лет${listing.demo ? " · демо-значение" : ""}`}</p></article>
          <article><strong>Формат урока</strong><p>{formatLabels[education.format] || "Не указан"} · {lessonLabels[education.lessonType] || "тип не указан"}</p></article>
          <article><strong>Стоимость</strong><p>{listing.priceLabel || "Уточните у преподавателя"}</p></article>
          <article><strong>Расписание</strong><p>{scheduleLabel(education.schedule)} · {education.availabilityNote || "Дату подтвердите перед записью"}</p></article>
          <article><strong>Место</strong><p>{listing.address || listing.district || "Расположение не указано"}</p></article>
          <article><strong>Расстояние</strong><p>{scoreListing(listing, { center: { lat: 43.6353, lng: 51.1682 } }).distanceKm == null ? "Неизвестно до выбора точки на карте" : `${scoreListing(listing, { center: { lat: 43.6353, lng: 51.1682 } }).distanceKm.toFixed(1)} км от Актау`}</p></article>
          <article><strong>Источник</strong><p>{listing.sourceLabel || "Источник не указан"}{listing.lastUpdatedAt ? ` · ${new Date(listing.lastUpdatedAt).toLocaleString("ru-RU")}` : ""}</p></article>
        </div>
        <div className="educationProfileActions"><Link href={`/education?focus=${encodeURIComponent(listing.id)}#directory-map`}><MapPin size={16} /> Посмотреть на карте</Link><button type="button" onClick={() => setRequest({ listing, mode: "contact" })}>Связаться</button><button type="button" onClick={() => setRequest({ listing, mode: "lesson" })}>Запросить занятие</button>{contactHref && <a href={contactHref}>Опубликованный контакт</a>}</div>
        <p className="educationProfileDisclaimer">Отзывы, оценки, квалификации и расписание в демо-профиле вымышлены и не подтверждают реальных преподавателей.</p>
      </section>
      <LessonRequestDialog listing={request?.listing} mode={request?.mode} onClose={() => setRequest(null)} />
    </main>
  );
}

function TezTapEducationLink({ listing, scoreContext }) {
  const message = `Проанализируй учебный вариант в Актау: ${listing.title}; предметы ${listing.education?.subjects?.join(", ") || "не указаны"}; цена ${listing.priceLabel || "неизвестна"}; адрес ${listing.address || "неизвестен"}. Проверь ограничения данных и объясни рекомендацию.`;
  const href = `/analyze?mercoraPrompt=${encodeURIComponent(message)}#mercora-ai`;
  function saveContext() {
    try {
      const scored = scoreListing(listing, scoreContext);
      window.sessionStorage.setItem("mercora.discovery.ai-context.v1", JSON.stringify({ request: message, category: "education", center: scoreContext?.center, radiusKm: scoreContext?.radiusKm, records: [{ ...listing, distanceKm: scored.distanceKm, recommendationScore: scored.recommendationScore, factors: scored.recommendationFactors, demo: listing.demo === true }] }));
    } catch { /* Continue to the original TezTap AI flow if session storage is unavailable. */ }
  }
  return <Link href={href} onClick={saveContext}><SparklesIcon /> Анализ TezTap</Link>;
}

function SparklesIcon() { return <span aria-hidden="true">✦</span>; }

function scheduleLabel(schedule = []) {
  if (!Array.isArray(schedule) || !schedule.length) return "Расписание не опубликовано";
  return schedule.map((slot) => `${dayLabels[slot.day] || "День уточняется"}, ${slot.from}–${slot.to}`).join(" · ");
}

function getContactHref(listing) {
  if (listing.contactPhone) return `tel:${String(listing.contactPhone).replace(/[^+\d]/g, "")}`;
  if (listing.contactEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(listing.contactEmail)) return `mailto:${listing.contactEmail}`;
  if (listing.contactUrl && /^https:\/\//i.test(listing.contactUrl)) return listing.contactUrl;
  return null;
}
