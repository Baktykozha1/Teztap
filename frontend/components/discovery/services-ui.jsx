"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, Clock3, MapPin, MessageCircle, Sparkles, Wrench } from "lucide-react";
import { FavoriteButton, RatingAndReviews, RecommendationScore } from "./discovery-ui";
import { scoreListing } from "../../lib/discovery";
import { dispatchWorkspaceActivity } from "../workspace-provider";

const REQUESTS_KEY = "mercora.services.requests.v1";
const CHAT_KEY = "mercora.services.chats.v1";
const serviceLabels = { "Repair specialists": "Ремонт", Plumbers: "Сантехники", Electricians: "Электрики", Cleaners: "Уборка", Babysitters: "Няни", Photographers: "Фотографы", Delivery: "Доставка", "Beauty professionals": "Красота", handyman: "Домашний мастер", plumber: "Сантехника", electrician: "Электрика", cleaner: "Уборка", photographer: "Фотограф", courier: "Доставка", childcare: "Уход за детьми", beauty_salon: "Салон красоты", auto_service: "Ремонт техники" };

export function useServiceRequests() {
  const [requests, setRequests] = useState([]);
  useEffect(() => { try { const items = JSON.parse(window.localStorage.getItem(REQUESTS_KEY) || "[]"); setRequests(Array.isArray(items) ? items : []); } catch { setRequests([]); } }, []);
  function saveRequest(request) {
    const item = { id: `service-request-${Date.now()}`, ...request, status: "saved-local", createdAt: new Date().toISOString() };
    try {
      const existing = JSON.parse(window.localStorage.getItem(REQUESTS_KEY) || "[]");
      const next = [item, ...(Array.isArray(existing) ? existing : [])].slice(0, 10);
      window.localStorage.setItem(REQUESTS_KEY, JSON.stringify(next));
      dispatchWorkspaceActivity("booking", { id: item.id, title: item.listing?.title || item.category || "Услуга", category: "services", preferredDate: item.preferredDate, preferredTime: item.preferredTime, status: item.status });
      setRequests(next);
      return true;
    } catch { return false; }
  }
  return { requests, saveRequest };
}

export function ServiceFilters({ value, onChange }) {
  function update(key, next) { onChange((current) => ({ ...current, [key]: next })); }
  return <section className="serviceFilters" aria-label="Фильтры услуг"><label>Цена до, ₸<input type="number" min="0" value={value.maxPrice} onChange={(event) => update("maxPrice", event.target.value)} placeholder="Любая" /></label><label>Рейтинг от<select value={value.minRating} onChange={(event) => update("minRating", event.target.value)}><option value="">Любой</option><option value="4">4.0+</option><option value="4.5">4.5+</option><option value="4.8">4.8+</option></select></label><label>Дата<input type="date" min={today()} value={value.date} onChange={(event) => update("date", event.target.value)} /></label><label>Время<input type="time" value={value.time} onChange={(event) => update("time", event.target.value)} /></label><label className="serviceUrgentFilter"><input type="checkbox" checked={value.urgent} onChange={(event) => update("urgent", event.target.checked)} /> Срочно · сегодня</label><button type="button" onClick={() => onChange({ maxPrice: "", minRating: "", date: "", time: "", urgent: false })}>Сбросить</button></section>;
}

export function matchesServiceFilters(listing, filters) {
  const service = listing.service;
  if (!service) return !filters.maxPrice && !filters.minRating && !filters.date && !filters.time && !filters.urgent;
  const price = service.priceFrom ?? listing.priceAmount;
  if (filters.maxPrice && (price == null || Number(price) > Number(filters.maxPrice))) return false;
  if (filters.minRating && (listing.rating == null || Number(listing.rating) < Number(filters.minRating))) return false;
  if (filters.date && service.availableDate !== filters.date) return false;
  if (filters.time && (!service.availableTime || service.availableTime < filters.time)) return false;
  if (filters.urgent && service.urgentToday !== true) return false;
  return true;
}

export function ServiceCard({ listing, alternatives = 1, favorite, onToggleFavorite, onViewOnMap, onRequest, onChat, onDetails, selected, scoreContext }) {
  const service = listing.service;
  const score = scoreListing(listing, scoreContext);
  const contact = getContactHref(listing);
  return <article id={`listing-${listing.id}`} className={`serviceCard ${selected ? "selected" : ""}`} aria-current={selected ? "true" : undefined}>
    <div className="serviceCardTop"><span className={listing.demo ? "demoBadge" : "dataSourceBadge"}>{listing.demo ? "OLX · пример TezTap" : listing.sourceLabel || "Открытые данные"}</span><FavoriteButton active={favorite} onClick={() => onToggleFavorite(listing.id)} /></div>
    <div className="serviceCardHeading"><div className="serviceAvatar" role="img" aria-label="Фотография специалиста не предоставлена"><Wrench size={23} /><span>Фото не добавлено</span></div><div><span>{serviceLabels[listing.subtype] || listing.subtypeLabel || listing.subtype}</span><h3>{listing.title}</h3><p>{listing.provider}</p>{alternatives > 1 && <small className="serviceAlternativeCount">Ещё {alternatives - 1} варианта этой услуги</small>}</div><RecommendationScore score={score.recommendationScore} /></div>
    <p className="serviceDescription">{listing.description}</p>
    <div className="servicePortfolio">{service?.portfolio?.length ? service.portfolio.map((image) => <img key={image} src={image} alt="Работа специалиста" loading="lazy" />) : <div><Camera size={15} /><span>Портфолио пока не добавлено</span></div>}</div>
    <div className="serviceFacts"><strong>{service?.priceFrom == null ? listing.priceLabel || "Цена не указана" : `от ${new Intl.NumberFormat("ru-RU").format(service.priceFrom)} ₸${service.pricePeriod ? ` / ${service.pricePeriod}` : ""}`}</strong><span className="serviceRating"><RatingAndReviews rating={listing.rating} count={listing.ratingCount} summary={listing.reviewSummary || "Нет подтверждённых отзывов."} demo={listing.demo} /></span><span><MapPin size={14} />{listing.address || service?.serviceArea?.join(", ") || listing.district || "Зона выезда не указана"} · {score.distanceKm == null ? "расстояние неизвестно" : `${score.distanceKm.toFixed(1)} км`}</span><span><Clock3 size={14} />{service?.availableDate ? `${formatDate(service.availableDate)} · ${service.availableTime || "время уточняется"}` : "Ближайшее время неизвестно"}{service?.urgentToday ? " · может сегодня" : ""}</span></div>
    <small className="serviceSource">Формат объявления: {listing.sourceLabel || "не указан"}</small>
    <div className="serviceCardActions"><button type="button" onClick={() => onDetails(listing)}>Об услуге</button><button type="button" onClick={() => onChat(listing)}><MessageCircle size={14} /> Чат</button><button type="button" className="serviceBookButton" onClick={() => onRequest({ listing, mode: "booking" })}>Заказать</button><Link href="#directory-map" onClick={() => onViewOnMap(listing)}><MapPin size={14} /> На карте</Link>{contact && <a href={contact} target={contact.startsWith("https:") ? "_blank" : undefined} rel={contact.startsWith("https:") ? "noreferrer" : undefined}>Контакт</a>}<TezTapServiceLink listing={listing} scoreContext={scoreContext} /></div>
  </article>;
}

export function ServicesWorkspace({ requests, onNewRequest }) {
  return <section className="servicesWorkspace"><div><div><span className="educationEyebrow">Нужен специалист?</span><h2>Опишите задачу и выберите место на карте</h2><p>Заполните запрос, чтобы сохранить детали и выбранную точку рядом с вами.</p></div><button type="button" onClick={() => onNewRequest(null)}>Создать заявку</button></div>{requests.length > 0 && <details><summary>Мои заявки · {requests.length}</summary><ul>{requests.slice(0, 5).map((request) => <li key={request.id}><strong>{request.category}</strong><span>{request.status === "saved-local" ? "Сохранена на устройстве · не отправлена" : request.status}</span></li>)}</ul></details>}</section>;
}

export function ServiceRequestDialog({ listing, mode, location, draft = {}, onClose, onChooseMap, onSave }) {
  const [image, setImage] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setImage(null); setSaved(false); setError(""); }, [listing?.id, mode]);
  useEffect(() => { if (!listing && mode !== "new") return undefined; function onKey(event) { if (event.key === "Escape") onClose(); } window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [listing, mode, onClose]);
  if (!listing && mode !== "new") return null;
  function handleImage(event) {
    const file = event.target.files?.[0];
    if (!file) return setImage(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 200 * 1024) { setError("Можно прикрепить JPG, PNG или WebP размером до 200 КБ."); event.target.value = ""; return; }
    setError("");
    const reader = new FileReader();
    reader.onload = () => setImage({ name: file.name.slice(0, 100), dataUrl: String(reader.result) });
    reader.onerror = () => setError("Не удалось прочитать изображение.");
    reader.readAsDataURL(file);
  }
  function submit(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const savedSuccessfully = onSave({ listingId: listing?.id || null, provider: listing?.provider || null, category: fields.get("category"), description: fields.get("description"), location, preferredDate: fields.get("preferredDate"), preferredTime: fields.get("preferredTime"), budget: fields.get("budget") ? Number(fields.get("budget")) : null, image });
    if (!savedSuccessfully) return setError("Не удалось сохранить заявку. Проверьте свободное место и настройки хранилища браузера.");
    setSaved(true);
  }
  function chooseMap(event) {
    const form = event.currentTarget.closest("form");
    onChooseMap(Object.fromEntries(new FormData(form)));
  }
  return <div className="serviceDialogBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="serviceDialog" role="dialog" aria-modal="true" aria-labelledby="service-request-title"><button type="button" className="educationDialogClose" onClick={onClose} aria-label="Закрыть">×</button><span className="educationEyebrow">{mode === "booking" ? "Запись на услугу" : "Заявка на услугу"}</span><h2 id="service-request-title">{saved ? "Заявка сохранена" : listing?.title || "Найти специалиста"}</h2>{saved ? <p className="serviceLocalNotice">Заявка сохранена только на этом устройстве. Специалист не получил её. Для реального заказа используйте опубликованный контакт, если он есть.</p> : <form className="serviceRequestForm" onSubmit={submit}>
    <label>Категория<select name="category" defaultValue={draft.category || mapServiceCategory(listing?.subtype) || "Repair specialists"}>{Object.entries(serviceLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
    <div className="serviceRequestLocation"><div><strong>Место работ</strong><span>{location?.address || "Точка на карте Актау"}</span><small>{location ? `${location.coordinates.lat.toFixed(5)}, ${location.coordinates.lng.toFixed(5)}` : "Выберите точку на общей карте"}</small></div><button type="button" onClick={chooseMap}>Выбрать на карте</button></div>
    <label>Опишите задачу<textarea name="description" defaultValue={draft.description || ""} required rows="4" maxLength="1200" placeholder="Что нужно сделать? Укажите важные детали…" /></label>
    <div className="serviceDateTime"><label>Дата<input name="preferredDate" type="date" min={today()} defaultValue={draft.preferredDate || (mode === "booking" ? listing?.service?.availableDate || "" : "")} required /></label><label>Время<input name="preferredTime" type="time" defaultValue={draft.preferredTime || (mode === "booking" ? listing?.service?.availableTime || "" : "")} required /></label></div>
    <label>Ориентировочный бюджет, ₸<input name="budget" type="number" min="0" max="100000000" defaultValue={draft.budget || (mode === "booking" ? listing?.service?.priceFrom ?? listing?.priceAmount ?? "" : "")} placeholder="Можно не указывать" /></label>
    <label>Фото проблемы · JPG, PNG или WebP, до 200 КБ<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImage} /></label>{image && <small className="serviceImageSelected">Файл добавлен: {image.name}</small>}
    <p className="serviceLocalNotice">Демо-форма сохраняет заявку локально; она не отправляет сообщение исполнителю.</p>{error && <p className="serviceFormError" role="alert">{error}</p>}<button className="serviceSubmitButton" type="submit">Сохранить заявку</button>
  </form>}</section></div>;
}

export function ServiceChatDialog({ listing, onClose }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { try { const threads = JSON.parse(window.localStorage.getItem(CHAT_KEY) || "{}"); const thread = threads[listing?.id]; setMessages(Array.isArray(thread) ? thread : []); } catch { setMessages([]); } setSaved(false); }, [listing?.id]);
  useEffect(() => { if (!listing) return undefined; function onKey(event) { if (event.key === "Escape") onClose(); } window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [listing, onClose]);
  if (!listing) return null;
  function send(event) { event.preventDefault(); if (!draft.trim()) return; const nextMessage = { id: `message-${Date.now()}`, text: draft.trim().slice(0, 1000), createdAt: new Date().toISOString() }; try { const raw = JSON.parse(window.localStorage.getItem(CHAT_KEY) || "{}"); const threads = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}; const next = [...(Array.isArray(threads[listing.id]) ? threads[listing.id] : []), nextMessage].slice(-40); threads[listing.id] = next; const limitedThreads = Object.fromEntries(Object.entries(threads).slice(-25)); window.localStorage.setItem(CHAT_KEY, JSON.stringify(limitedThreads)); dispatchWorkspaceActivity("message", { ...nextMessage, threadId: listing.id, title: listing.title, recipient: listing.provider || listing.title, category: "services" }); setMessages(next); setDraft(""); setSaved(true); } catch { setSaved(false); } }
  return <div className="serviceDialogBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="serviceDialog serviceChatDialog" role="dialog" aria-modal="true" aria-labelledby="service-chat-title"><button type="button" className="educationDialogClose" onClick={onClose} aria-label="Закрыть">×</button><h2 id="service-chat-title">Чат · {listing.provider || listing.title}</h2><p className="serviceLocalNotice">Сообщения остаются на этом устройстве и не доставляются исполнителю.</p><div className="serviceChatMessages">{messages.map((message) => <p key={message.id}>{message.text}<small>{new Date(message.createdAt).toLocaleString("ru-RU")}</small></p>)}{!messages.length && <span>Начните локальный черновик переписки.</span>}</div><form className="serviceChatForm" onSubmit={send}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength="1000" rows="3" placeholder="Напишите сообщение…" /><button type="submit" disabled={!draft.trim()}>Сохранить сообщение</button></form>{saved && <small className="serviceImageSelected">Сообщение сохранено в локальном чате.</small>}</section></div>;
}

export function ServiceDetailsDialog({ listing, onClose, onRequest, onChat }) {
  useEffect(() => { if (!listing) return undefined; function onKey(event) { if (event.key === "Escape") onClose(); } window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [listing, onClose]);
  if (!listing) return null;
  return <div className="serviceDialogBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="serviceDialog" role="dialog" aria-modal="true" aria-labelledby="service-details-title"><button type="button" className="educationDialogClose" onClick={onClose} aria-label="Закрыть">×</button><span className={listing.demo ? "demoBadge" : "dataSourceBadge"}>{listing.demo ? "OLX · пример TezTap" : listing.sourceLabel}</span><h2 id="service-details-title">{listing.title}</h2><p>{listing.description}</p><div className="jobProfileGrid"><article><strong>Категория</strong><p>{serviceLabels[listing.subtype] || listing.subtype}</p></article><article><strong>Цена</strong><p>{listing.service?.priceFrom ? `от ${new Intl.NumberFormat("ru-RU").format(listing.service.priceFrom)} ₸` : listing.priceLabel || "Не указана"}</p></article><article><strong>Зона выезда</strong><p>{listing.address || listing.service?.serviceArea?.join(", ") || listing.district || "Не указана"}</p></article><article><strong>Ближайшее время</strong><p>{listing.service?.availableDate ? `${formatDate(listing.service.availableDate)} · ${listing.service.availableTime}` : "Не указано"}</p></article><article><strong>Рейтинг и отзывы</strong><p>{listing.rating == null ? "Не указаны" : `${listing.rating} · ${listing.ratingCount ?? "число отзывов неизвестно"}`}</p></article><article><strong>Портфолио</strong><p>Фото не предоставлены. Превью не создаёт впечатления о реальных работах.</p></article></div><div className="serviceCardActions"><button type="button" onClick={() => onChat(listing)}><MessageCircle size={14} /> Чат</button><button type="button" className="serviceBookButton" onClick={() => onRequest({ listing, mode: "booking" })}>Заказать услугу</button></div></section></div>;
}

function TezTapServiceLink({ listing, scoreContext }) {
  const message = `Проанализируй услугу в Актау: ${listing.title}; категория ${serviceLabels[listing.subtype] || listing.subtype}; цена ${listing.service?.priceFrom ?? listing.priceAmount ?? "неизвестна"} ₸; доступность ${listing.service?.availableDate || "не указана"}; район ${listing.district || listing.address || "неизвестен"}. Укажи, если данных недостаточно.`;
  const href = `/analyze?mercoraPrompt=${encodeURIComponent(message)}#mercora-ai`;
  function preserve() { try { const score = scoreListing(listing, scoreContext); window.sessionStorage.setItem("mercora.discovery.ai-context.v1", JSON.stringify({ request: message, category: "services", center: scoreContext?.center, radiusKm: scoreContext?.radiusKm, records: [{ ...listing, distanceKm: score.distanceKm, recommendationScore: score.recommendationScore, factors: score.recommendationFactors }] })); } catch { /* Continue to the standard TezTap flow. */ } }
  return <Link href={href} onClick={preserve}><Sparkles size={14} /> TezTap</Link>;
}

function getContactHref(listing) { if (listing.contactPhone) return `tel:${String(listing.contactPhone).replace(/[^+\d]/g, "")}`; if (listing.contactEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(listing.contactEmail)) return `mailto:${listing.contactEmail}`; if (listing.contactUrl && /^https:\/\//i.test(listing.contactUrl)) return listing.contactUrl; return null; }
function mapServiceCategory(subtype = "") { const value = String(subtype).toLowerCase(); if (/plumb|сантех/.test(value)) return "Plumbers"; if (/electric|электр/.test(value)) return "Electricians"; if (/clean|уборк/.test(value)) return "Cleaners"; if (/baby|childcare|нян/.test(value)) return "Babysitters"; if (/photo|фото/.test(value)) return "Photographers"; if (/beauty|salon|красот/.test(value)) return "Beauty professionals"; if (/deliver|courier|курьер|достав/.test(value)) return "Delivery"; return "Repair specialists"; }
function today() { return new Date().toISOString().slice(0, 10); }
function formatDate(value) { return new Date(`${value}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }); }
