"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, Clock3, HeartPulse, MapPin, Navigation, Phone, Sparkles, Store, Ticket, UtensilsCrossed, Dumbbell, Scissors, X } from "lucide-react";
import { FavoriteButton, RatingAndReviews, RecommendationDetails, RecommendationScore } from "./discovery-ui";
import { scoreListing } from "../../lib/discovery";
import { isOpenAt } from "../../lib/place-hours";
import { dispatchWorkspaceActivity } from "../workspace-provider";

const BOOKINGS_KEY = "mercora.places.booking-requests.v1";

export function placeKind(listing) {
  const value = String(listing.subtype || "").toLowerCase();
  if (/restaurant/.test(value)) return "Restaurants";
  if (/cafes|cafe|cafe|fast_food|coffee/.test(value)) return "Cafes";
  if (/pharmac|chemist/.test(value)) return "Pharmacies";
  if (/clinic|doctor|hospital/.test(value)) return "Clinics";
  if (/gym|fitness|sports_centre/.test(value)) return "Gyms";
  if (/salon|beauty|hairdresser|barber/.test(value)) return "Salons";
  if (/entertainment|cinema|theatre|arts_centre|nightclub|bowling|museum/.test(value)) return "Entertainment";
  if (/shop|store|supermarket|convenience|grocery|greengrocer|clothes|electronics/.test(value)) return "Shops";
  return "Other";
}

export function placeGroup(listing) {
  return ({ Restaurants: "food", Cafes: "food", Clinics: "health", Pharmacies: "health", Gyms: "gyms", Salons: "beauty", Shops: "shops", Entertainment: "entertainment" })[placeKind(listing)] || "other";
}

export function matchesPlaceFilters(listing, filters, now) {
  const place = listing.place || {};
  if (filters.maxPriceLevel && (place.priceLevel == null || !Number.isFinite(Number(place.priceLevel)) || Number(place.priceLevel) > Number(filters.maxPriceLevel))) return false;
  if (filters.minRating && (listing.rating == null || Number(listing.rating) < Number(filters.minRating))) return false;
  if (filters.openNow && isOpenAt(listing.openingHours, now) !== true) return false;
  if (filters.openAt && isOpenAt(listing.openingHours, now, filters.openAt) !== true) return false;
  if (filters.bookingOnly && place.bookingAvailable !== true) return false;
  return true;
}

export function PlacesFilters({ value, onChange }) {
  const update = (key, next) => onChange((current) => ({ ...current, [key]: next }));
  return <section className="placesFilters" aria-label="Фильтры мест">
    <label>Уровень цен<select value={value.maxPriceLevel} onChange={(event) => update("maxPriceLevel", event.target.value)}><option value="">Любой</option><option value="1">₸ · бюджетно</option><option value="2">₸₸ · средний</option><option value="3">₸₸₸ · выше среднего</option><option value="4">₸₸₸₸ · любой известный</option></select></label>
    <label>Рейтинг<select value={value.minRating} onChange={(event) => update("minRating", event.target.value)}><option value="">Любой</option><option value="4">От 4,0</option><option value="4.5">От 4,5</option><option value="4.8">От 4,8</option></select></label>
    <label>Открыто в указанное время<input type="time" value={value.openAt} onChange={(event) => update("openAt", event.target.value)} /></label>
    <label className="placesCheck"><input type="checkbox" checked={value.openNow} onChange={(event) => update("openNow", event.target.checked)} />Открыто сейчас</label>
    <label className="placesCheck"><input type="checkbox" checked={value.bookingOnly} onChange={(event) => update("bookingOnly", event.target.checked)} />Есть запись</label>
    <button type="button" onClick={() => onChange({ maxPriceLevel: "", minRating: "", openAt: "", openNow: false, bookingOnly: false })}>Сбросить</button>
    <p>Часы и запись фильтруются только при наличии данных. Для сложных графиков OpenStreetMap статус остаётся неизвестным.</p>
  </section>;
}

export function PlacesTopRecommendations({ items, onViewOnMap }) {
  return <section className="placesTopSection" aria-labelledby="places-top-title"><div className="placesTopHeading"><span><Sparkles size={17} /> Выбор TezTap</span><h2 id="places-top-title">Три лучших варианта поблизости</h2><p>Ранг рассчитан исходной формулой TezTap: рейтинг 40%, отзывы 20%, расстояние 20%, категория 20%. Цены и наличие записи показаны отдельно.</p></div>
    {items.length ? <div className="placesTopGrid">{items.map((item, index) => <button type="button" className="placesTopItem" key={item.id} onClick={() => onViewOnMap(item)}><span className="placesTopRank">{index + 1}</span><span className="placesTopCopy"><strong>{item.title}</strong><small>{item.district || item.address || "Актау"} · {item.distanceKm == null ? "расстояние неизвестно" : `${item.distanceKm.toFixed(1)} км`}</small><span>{item.recommendationAdvantages[0] || "Выбран по доступным геоданным"}{item.recommendationDisadvantages.length ? ` · Учтите: ${item.recommendationDisadvantages[0]}` : ""}</span><em>{item.demo ? "ДЕМО · НЕ ПРОВЕРЕНО" : item.sourceLabel || "Источник не указан"}</em></span><b>{item.recommendationScore}<small>/100</small></b></button>)}</div> : <p className="placesTopEmpty">Подходящих мест в текущем радиусе нет. Измените фильтры или точку поиска.</p>}
  </section>;
}

export function PlaceCard({ listing, rank, favorite, onToggleFavorite, onViewOnMap, onBook, selected, scoreContext, now }) {
  const [imageFailed, setImageFailed] = useState(false);
  const item = scoreListing(listing, scoreContext);
  const place = listing.place || {};
  const imageUrl = Array.isArray(place.images) ? place.images.find((url) => /^https:\/\//i.test(url)) : null;
  const open = now ? isOpenAt(listing.openingHours, now) : null;
  const contact = contactLink(listing);
  return <article id={`listing-${listing.id}`} className={`discoveryListingCard placeCard ${selected ? "selected" : ""} ${rank ? "topRanked" : ""}`} aria-current={selected ? "true" : undefined}>
    <div className="placeCardImage">{imageUrl && !imageFailed ? <img src={imageUrl} alt={listing.title} loading="lazy" onError={() => setImageFailed(true)} /> : <PlacePlaceholder group={placeGroup(listing)} />}{rank && <span className="placeRankBadge">№ {rank} · выбор TezTap</span>}<FavoriteButton active={favorite} onClick={() => onToggleFavorite(listing.id)} /></div>
    <div className="placeCardContent"><div className="placeCardTitle"><div><span>{placeCategoryLabel(listing)}</span><h3>{listing.title}</h3></div><RecommendationScore score={item.recommendationScore} /></div><p>{listing.description || "Описание пока не добавлено."}</p>
      <div className="placeCardFacts"><span><MapPin size={14} />{listing.address || listing.district || "Адрес не указан"} · {item.distanceKm == null ? "расстояние неизвестно" : `${item.distanceKm.toFixed(1)} км`}</span><span><Clock3 size={14} />{listing.openingHours ? readableHours(listing.openingHours) : "Часы не указаны"} · <b className={open === true ? "open" : open === false ? "closed" : "unknown"}>{open === true ? "Открыто сейчас" : open === false ? "Закрыто сейчас" : "Статус неизвестен"}</b></span><span><Ticket size={14} />{place.priceRange || (place.averageBill != null ? `Средний чек ${formatMoney(place.averageBill)} ₸` : listing.priceAmount != null ? listing.priceLabel || `от ${formatMoney(listing.priceAmount)} ₸` : "Цена не указана")} {place.priceLevel ? `· ${"₸".repeat(Math.min(4, Number(place.priceLevel)))}` : ""}</span><span className="placeRating"><RatingAndReviews rating={listing.rating} count={listing.ratingCount} summary={listing.reviewSummary || "Проверенные отзывы пока недоступны."} demo={listing.demo} /></span></div>
      <small className={listing.demo ? "demoBadge" : "dataSourceBadge"}>{listing.demo ? "ДЕМО · НЕ ПРОВЕРЕНО" : listing.sourceLabel || "Источник не указан"}{listing.lastUpdatedAt ? ` · обновлено ${new Date(listing.lastUpdatedAt).toLocaleDateString("ru-RU")}` : ""}{/^https:\/\//i.test(listing.sourceUrl || "") && <> · <a href={listing.sourceUrl} target="_blank" rel="noreferrer">Открыть источник</a></>}</small>
      <RecommendationDetails item={item} />
      <div className="placeCardActions"><a href={directionsUrl(listing)} target="_blank" rel="noreferrer"><Navigation size={14} /> Маршрут</a><button type="button" onClick={() => onViewOnMap(listing)}><MapPin size={14} /> На карте</button><button type="button" onClick={() => onBook(listing)}><CalendarDays size={14} /> Записаться</button>{contact ? <a href={contact.href} target={contact.external ? "_blank" : undefined} rel={contact.external ? "noreferrer" : undefined}><Phone size={14} /> {contact.label}</a> : <span>Контакт не опубликован</span>}<TezTapPlaceLink listing={listing} scored={item} scoreContext={scoreContext} /></div>
    </div>
  </article>;
}

export function PlaceBookingDialog({ listing, onClose }) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setSaved(false); setError(""); }, [listing?.id]);
  if (!listing) return null;
  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const record = { id: `place-request-${Date.now()}`, listingId: listing.id, title: listing.title, name: String(form.get("name")).trim().slice(0, 80), preferredDate: form.get("date"), preferredTime: form.get("time"), note: String(form.get("note") || "").trim().slice(0, 500), createdAt: new Date().toISOString(), status: "saved-local" };
    try { const current = JSON.parse(window.localStorage.getItem(BOOKINGS_KEY) || "[]"); window.localStorage.setItem(BOOKINGS_KEY, JSON.stringify([record, ...(Array.isArray(current) ? current : [])].slice(0, 30))); dispatchWorkspaceActivity("booking", { id: record.id, title: listing.title, category: "places", preferredDate: record.preferredDate, preferredTime: record.preferredTime, status: "saved-local", demo: listing.demo === true }); setSaved(true); } catch { setError("Не удалось сохранить запрос. Проверьте настройки браузера и свободное место."); }
  }
  return <div className="serviceDialogBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="serviceDialog placeBookingDialog" role="dialog" aria-modal="true" aria-label={`Запись в ${listing.title}`}><button type="button" className="educationDialogClose" aria-label="Закрыть" onClick={onClose}><X size={18} /></button><span className="educationEyebrow">Место · Актау</span><h2>{saved ? "Запрос сохранён" : `Запись · ${listing.title}`}</h2>{saved ? <p className="placeBookingNotice">Запрос сохранён на этом устройстве. Заведение его не получило. Для подтверждения свяжитесь с ним по опубликованному контакту.</p> : <form className="placeBookingForm" onSubmit={submit}><p className="placeBookingNotice">{listing.place?.bookingAvailable === true ? "Возможность записи указана в карточке. Подтвердите время напрямую у заведения." : "Возможность записи не подтверждена. Эта форма сохраняет локальный запрос для вас."}</p><label>Ваше имя<input name="name" required maxLength="80" placeholder="Как к вам обращаться" /></label><div><label>Дата<input name="date" type="date" required min={aktauToday()} /></label><label>Время<input name="time" type="time" required /></label></div><label>Комментарий (необязательно)<textarea name="note" maxLength="500" rows="3" placeholder="Например, два человека" /></label>{error && <p role="alert" className="placeBookingError">{error}</p>}<button type="submit">Сохранить запрос</button></form>}</section></div>;
}

function TezTapPlaceLink({ listing, scored, scoreContext }) {
  const prompt = `Проанализируй место в Актау: ${listing.title}; категория ${placeCategoryLabel(listing)}; адрес ${listing.address || listing.district || "не указан"}; рейтинг ${listing.rating ?? "неизвестен"}; часы ${listing.openingHours || "неизвестны"}; цена ${listing.priceLabel || "неизвестна"}. Объясни преимущества, недостатки и происхождение данных.`;
  function preserve() { try { window.sessionStorage.setItem("mercora.discovery.ai-context.v1", JSON.stringify({ request: prompt, category: "places", center: scoreContext.center, radiusKm: scoreContext.radiusKm, records: [{ ...listing, distanceKm: scored.distanceKm, recommendationScore: scored.recommendationScore, factors: scored.recommendationFactors }] })); } catch { /* TezTap still opens through the regular route. */ } }
  return <Link href={`/analyze?mercoraPrompt=${encodeURIComponent(prompt)}#mercora-ai`} onClick={preserve}><Sparkles size={14} /> Спросить TezTap</Link>;
}

function PlacePlaceholder({ group }) { const Icon = ({ food: UtensilsCrossed, health: HeartPulse, gyms: Dumbbell, beauty: Scissors, shops: Store, entertainment: Ticket })[group] || MapPin; return <div className="placeImagePlaceholder"><Icon size={32} strokeWidth={1.5} /><span>Фото не добавлено</span></div>; }
function placeCategoryLabel(listing) { if (listing.subtypeLabel) return listing.subtypeLabel; const value = String(listing.subtype || "").toLowerCase(); if (/pharmac|chemist/.test(value)) return "Аптека"; if (/clinic|doctor|hospital/.test(value)) return "Клиника"; if (/restaurant/.test(value)) return "Ресторан"; if (/café|cafe|coffee|fast_food/.test(value)) return "Кафе"; return ({ gyms: "Спортзал", beauty: "Салон красоты", shops: "Магазин", entertainment: "Развлечения" })[placeGroup(listing)] || "Место"; }
function readableHours(value) { return String(value).replaceAll("Mo-Su", "Ежедневно").replaceAll("Mo-Fr", "Пн–Пт").replaceAll("Sa-Su", "Сб–Вс").replaceAll("24/7", "Круглосуточно"); }
function formatMoney(value) { return new Intl.NumberFormat("ru-RU").format(value); }
function aktauToday() { const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}`; }
function directionsUrl(listing) { return `https://www.openstreetmap.org/directions?to=${encodeURIComponent(`${listing.coordinates.lat},${listing.coordinates.lng}`)}`; }
function contactLink(listing) { const phone = String(listing.contactPhone || "").replace(/[^+\d]/g, ""); if (phone.length >= 7) return { href: `tel:${phone}`, label: "Позвонить", external: false }; const email = String(listing.contactEmail || ""); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { href: `mailto:${email}`, label: "Написать", external: false }; if (/^https:\/\//i.test(listing.contactUrl || "")) return { href: listing.contactUrl, label: "Сайт", external: true }; return null; }
