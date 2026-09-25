"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Armchair, Baby, Bike, Camera, CheckCircle2, Clock3, MapPin, MessageCircle, Package, ShieldCheck, Smartphone, Store, Wrench, X } from "lucide-react";
import { FavoriteButton, RatingAndReviews } from "./discovery-ui";
import { scoreListing } from "../../lib/discovery";
import { dispatchWorkspaceActivity } from "../workspace-provider";

const LISTINGS_KEY = "mercora.marketplace.listings.v1";
const CHAT_KEY = "mercora.marketplace.chats.v1";
const REPORTS_KEY = "mercora.marketplace.reports.v1";
const categories = ["Все категории", "Электроника", "Мебель", "Дом и ремонт", "Детям", "Одежда", "Спорт", "Инструменты", "Другое"];
const conditions = ["Любое состояние", "Новое", "Как новое", "Хорошее", "Есть следы использования"];
const areas = [
  { name: "14-й микрорайон", lat: 43.652575, lng: 51.1455 },
  { name: "15-й микрорайон", lat: 43.663735, lng: 51.135897 },
  { name: "17-й микрорайон", lat: 43.670803, lng: 51.141215 },
  { name: "Шыгыс", lat: 43.676975, lng: 51.186971 },
  { name: "3-й микрорайон", lat: 43.636907, lng: 51.177192 }
];

export function useMarketplaceListings() {
  const [localListings, setLocalListings] = useState([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(LISTINGS_KEY) || "[]");
      setLocalListings(Array.isArray(saved) ? saved.filter(isSafeMarketplaceListing) : []);
    } catch { setLocalListings([]); }
  }, []);
  function createListing(draft) {
    const record = { ...draft, id: `market-user-${Date.now()}`, category: "marketplace", city: "Актау", source: "user_generated", sourceLabel: "Объявление пользователя · опубликовано локально на устройстве", demo: false, rating: null, ratingCount: null, lastUpdatedAt: new Date().toISOString(), createdAt: new Date().toISOString(), availabilityStatus: "available" };
    try {
      const current = JSON.parse(window.localStorage.getItem(LISTINGS_KEY) || "[]");
      const next = [record, ...(Array.isArray(current) ? current.filter(isSafeMarketplaceListing) : [])].slice(0, 30);
      window.localStorage.setItem(LISTINGS_KEY, JSON.stringify(next));
      setLocalListings(next);
      return true;
    } catch { return false; }
  }
  return { localListings, createListing };
}

export function MarketplaceFilters({ value, onChange }) {
  const patch = (key, next) => onChange((current) => ({ ...current, [key]: next }));
  return <section className="marketplaceFilters" aria-label="Фильтры Marketplace">
    <div className="marketplaceCategoryChips" aria-label="Категории товаров">{categories.map((category) => <button type="button" key={category} className={value.category === category ? "active" : ""} onClick={() => patch("category", category)}>{category}</button>)}</div>
    <div className="marketplaceFilterFields">
      <label>От, ₸<input type="number" min="0" value={value.minPrice} onChange={(event) => patch("minPrice", event.target.value)} placeholder="0" /></label>
      <label>До, ₸<input type="number" min="0" value={value.maxPrice} onChange={(event) => patch("maxPrice", event.target.value)} placeholder="Без лимита" /></label>
      <label>Состояние<select value={value.condition} onChange={(event) => patch("condition", event.target.value)}>{conditions.map((condition) => <option key={condition}>{condition}</option>)}</select></label>
    </div>
    <p className="marketplacePrivacyNote"><ShieldCheck size={15} /> Точное место встречи не показывается. В объявлении указан только район.</p>
  </section>;
}

export function MarketplaceWorkspace({ count, onCreate }) {
  return <section className="marketplaceWorkspace"><div className="marketplaceWorkspaceCopy"><span><Store size={16} /> TezTap Marketplace · Актау</span><h2>Покупайте рядом. Продавайте безопасно.</h2><p>{count} объявлений на общей карте города. Адрес продавца остаётся скрытым.</p></div><button type="button" className="marketplaceCreateButton" onClick={onCreate}>＋ Разместить объявление</button></section>;
}

export function MarketplaceCard({ listing, favorite, onToggleFavorite, onViewOnMap, onChat, onReport, onSafety, selected, scoreContext }) {
  const [imageFailed, setImageFailed] = useState(false);
  const score = scoreListing(listing, scoreContext);
  const item = listing.marketplace || {};
  const picture = item.imageDataUrl || item.imageUrl;
  const date = item.publishedAt || listing.createdAt || listing.lastUpdatedAt;
  return <article id={`listing-${listing.id}`} className={`discoveryListingCard marketplaceCard ${selected ? "selected" : ""}`} aria-current={selected ? "true" : undefined}>
    <div className="marketplaceMedia">
      {picture && !imageFailed ? <img src={picture} alt={listing.title} loading="lazy" onError={() => setImageFailed(true)} /> : <MarketplacePlaceholder category={item.category || listing.tags?.[0]} />}
      <span className="marketplaceTransactionBadge">{item.transactionType === "rent" || listing.subtype === "Rent" ? "Аренда" : "Продажа"}</span>
      <FavoriteButton active={favorite} onClick={() => onToggleFavorite(listing.id)} />
    </div>
    <div className="marketplaceCardBody">
      <div className="marketplaceCardEyebrow"><span>{item.category || marketplaceCategoryForListing(listing)}</span><span>{conditionLabel(item.condition || "Хорошее")}</span></div>
      <div className="marketplaceTitleRow"><div><h3>{listing.title}</h3><small>{item.sellerName || listing.provider}</small></div><strong className="marketplacePrice">{formatPrice(listing.priceAmount, item.transactionType || listing.subtype, listing.priceLabel)}</strong></div>
      <p className="marketplaceDescription">{listing.description}</p>
      <div className="marketplaceFacts"><span><MapPin size={14} />{item.area || listing.district || "Район Актау"} · {score.distanceKm == null ? "расстояние неизвестно" : `${score.distanceKm.toFixed(1)} км`}</span><span><Clock3 size={14} />{date ? `Опубликовано ${formatDate(date)}` : "Дата не указана"}</span><span className="marketplaceSellerRating"><RatingAndReviews rating={item.sellerRating ?? listing.rating} count={item.sellerRatingCount ?? listing.ratingCount} summary={listing.reviewSummary || "Отзывы о продавце пока не опубликованы."} demo={listing.demo} /></span></div>
      <div className="marketplaceCardActions"><button type="button" onClick={() => onChat(listing)}><MessageCircle size={15} /> Написать продавцу</button><button type="button" onClick={() => onViewOnMap(listing)}><MapPin size={15} /> На карте</button><button type="button" onClick={() => onSafety(listing)}><ShieldCheck size={14} /> Безопасность</button><button type="button" className="marketplaceReportAction" onClick={() => onReport(listing)}><AlertTriangle size={14} /> Пожаловаться</button></div>
      <small className={listing.demo ? "demoBadge" : "dataSourceBadge"}>{listing.demo ? "ДЕМО · НЕ ПРОВЕРЕНО" : "Объявление пользователя"} · TezTap Marketplace</small>
    </div>
  </article>;
}

export function MarketplaceCreateDialog({ onClose, onSave }) {
  const [image, setImage] = useState(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  function readImage(event) {
    const file = event.target.files?.[0];
    if (!file) return setImage(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 350 * 1024) { setError("Выберите JPG, PNG или WebP размером до 350 КБ."); event.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => { setImage({ name: file.name.slice(0, 90), dataUrl: String(reader.result) }); setError(""); };
    reader.onerror = () => setError("Не удалось прочитать изображение.");
    reader.readAsDataURL(file);
  }
  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const area = areas.find((entry) => entry.name === form.get("area")) || areas[0];
    // Public coordinates point to the district center, never to a private home.
    const saved = onSave({ title: String(form.get("title")).trim(), description: String(form.get("description")).trim(), subtype: form.get("transactionType") === "rent" ? "Rent" : "Buy", address: `${area.name}, Актау`, district: area.name, coordinates: { lat: area.lat, lng: area.lng }, city: "Актау", priceAmount: Number(form.get("price")), priceLabel: formatPrice(Number(form.get("price")), form.get("transactionType")), currency: "KZT", tags: [String(form.get("category")), String(form.get("condition"))], marketplace: { transactionType: form.get("transactionType"), category: form.get("category"), condition: form.get("condition"), area: area.name, sellerName: String(form.get("sellerName")).trim(), sellerRating: null, sellerRatingCount: null, imageName: image?.name || null, imageDataUrl: image?.dataUrl || null, publishedAt: new Date().toISOString() } });
    if (!saved) return setError("Не удалось сохранить объявление. Проверьте свободное место в хранилище браузера.");
    setDone(true);
  }
  return <Dialog title={done ? "Объявление сохранено" : "Новое объявление"} onClose={onClose}>
    {done ? <div className="marketplaceDialogSuccess"><CheckCircle2 size={28} /><p>Объявление добавлено в ленту на этом устройстве. Укажите район вместо точного адреса — он не раскрывается публично.</p><button type="button" onClick={onClose}>Готово</button></div> : <form className="marketplaceForm" onSubmit={submit}>
      <label>Название<input name="title" required maxLength="90" placeholder="Например, велосипед для подростка" /></label>
      <label>Описание<textarea name="description" required maxLength="1000" rows="3" placeholder="Состояние, комплект и удобное время для связи" /></label>
      <div className="marketplaceFormRow"><label>Тип<select name="transactionType"><option value="sale">Продажа</option><option value="rent">Аренда</option></select></label><label>Категория<select name="category">{categories.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label></div>
      <div className="marketplaceFormRow"><label>Цена, ₸ {"· аренда за день"}<input name="price" type="number" required min="1" max="1000000000" /></label><label>Состояние<select name="condition">{conditions.slice(1).map((condition) => <option key={condition}>{condition}</option>)}</select></label></div>
      <div className="marketplaceFormRow"><label>Район (публично)<select name="area">{areas.map((area) => <option key={area.name}>{area.name}</option>)}</select></label><label>Имя продавца<input name="sellerName" required maxLength="60" placeholder="Как к вам обращаться" /></label></div>
      <label>Фотография · JPG, PNG или WebP до 350 КБ<input type="file" accept="image/jpeg,image/png,image/webp" onChange={readImage} /></label>{image && <small className="marketplaceSelectedFile">Фото добавлено: {image.name}</small>}
      <p className="marketplacePrivacyNote"><ShieldCheck size={15} /> Не вводите точный адрес или код от подъезда. На карте останется только центр выбранного района.</p>
      {error && <p className="marketplaceError" role="alert">{error}</p>}<button type="submit" className="marketplaceCreateButton">Опубликовать на этом устройстве</button><small>Демо Marketplace хранит объявление локально. Оно не публикуется в интернете.</small>
    </form>}
  </Dialog>;
}

export function MarketplaceChatDialog({ listing, onClose }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  useEffect(() => { try { const chats = JSON.parse(window.localStorage.getItem(CHAT_KEY) || "{}"); setMessages(Array.isArray(chats?.[listing?.id]) ? chats[listing.id] : []); } catch { setMessages([]); } }, [listing?.id]);
  if (!listing) return null;
  function send(event) {
    event.preventDefault(); if (!draft.trim()) return;
    const message = { id: `message-${Date.now()}`, text: draft.trim().slice(0, 800), createdAt: new Date().toISOString() };
    try { const stored = JSON.parse(window.localStorage.getItem(CHAT_KEY) || "{}"); const chats = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}; const next = [...(Array.isArray(chats[listing.id]) ? chats[listing.id] : []), message].slice(-30); chats[listing.id] = next; window.localStorage.setItem(CHAT_KEY, JSON.stringify(chats)); dispatchWorkspaceActivity("message", { ...message, threadId: listing.id, title: listing.title, recipient: listing.marketplace?.sellerName || listing.provider, category: "marketplace" }); setMessages(next); setDraft(""); } catch { /* Storage error is announced below. */ }
  }
  return <Dialog title={`Чат · ${listing.marketplace?.sellerName || listing.provider || "продавец"}`} onClose={onClose}><p className="marketplacePrivacyNote"><ShieldCheck size={15} /> Переписка — локальный черновик на этом устройстве. Сообщение не отправляется продавцу.</p><div className="marketplaceChatMessages">{messages.length ? messages.map((message) => <p key={message.id}>{message.text}<small>{formatDate(message.createdAt)}</small></p>) : <span>Напишите сообщение, чтобы сохранить его в локальном чате.</span>}</div><form className="marketplaceChatForm" onSubmit={send}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength="800" required rows="2" placeholder="Здравствуйте! Объявление ещё актуально?" /><button type="submit" disabled={!draft.trim()}>Сохранить сообщение</button></form></Dialog>;
}

export function MarketplaceReportDialog({ listing, onClose, onSubmit }) {
  const [reason, setReason] = useState("Подозрительное объявление");
  const [details, setDetails] = useState("");
  const [saved, setSaved] = useState(false);
  if (!listing) return null;
  function submit(event) { event.preventDefault(); setSaved(onSubmit({ listingId: listing.id, reason, details: details.trim().slice(0, 500), createdAt: new Date().toISOString() })); }
  return <Dialog title={saved ? "Жалоба сохранена" : "Пожаловаться на объявление"} onClose={onClose}>{saved ? <p className="marketplacePrivacyNote"><CheckCircle2 size={16} /> Жалоба записана локально для демонстрации. Для реальной проверки нужен модератор сервиса.</p> : <form className="marketplaceForm" onSubmit={submit}><p className="marketplacePrivacyNote"><ShieldCheck size={15} /> Не переводите предоплату незнакомому продавцу. Проверьте товар лично и не сообщайте коды из SMS.</p><label>Причина<select value={reason} onChange={(event) => setReason(event.target.value)}><option>Подозрительное объявление</option><option>Неверная цена или описание</option><option>Запрещённый товар</option><option>Попытка мошенничества</option><option>Другая причина</option></select></label><label>Подробности (необязательно)<textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength="500" rows="3" /></label><button type="submit" className="marketplaceReportSubmit"><AlertTriangle size={15} /> Отправить жалобу</button></form>}</Dialog>;
}

export function MarketplaceSafetyDialog({ listing, onClose }) {
  if (!listing) return null;
  return <Dialog title="Безопасная сделка" onClose={onClose}><p className="marketplacePrivacyNote"><ShieldCheck size={16} /> Для встречи выберите общественное место. Карта показывает только примерный район продавца.</p><ul className="marketplaceSafetyList"><li>Не переводите предоплату, пока не осмотрели вещь.</li><li>Не сообщайте коды из SMS и данные банковской карты.</li><li>Проверьте товар и договоритесь о цене при личной встрече.</li><li>Если предложение кажется подозрительным, отправьте жалобу.</li></ul><button className="marketplaceReportSubmit" type="button" onClick={onClose}>Понятно</button></Dialog>;
}

export function saveMarketplaceReport(report) {
  try { const current = JSON.parse(window.localStorage.getItem(REPORTS_KEY) || "[]"); window.localStorage.setItem(REPORTS_KEY, JSON.stringify([report, ...(Array.isArray(current) ? current : [])].slice(0, 50))); return true; } catch { return false; }
}

export function marketplaceCategoryForListing(listing) {
  const tags = listing.tags || [];
  if (tags.some((tag) => /kid|child/i.test(tag))) return "Детям";
  if (tags.some((tag) => /tool/i.test(tag))) return "Инструменты";
  if (tags.some((tag) => /furniture/i.test(tag))) return "Мебель";
  return "Другое";
}

function Dialog({ title, onClose, children }) { return <div className="serviceDialogBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="serviceDialog marketplaceDialog" role="dialog" aria-modal="true" aria-label={title}><button className="educationDialogClose" type="button" aria-label="Закрыть" onClick={onClose}><X size={18} /></button><h2>{title}</h2>{children}</section></div>; }
function MarketplacePlaceholder({ category = "" }) { const normalized = String(category).toLowerCase(); const Icon = /дет|baby|kids/.test(normalized) ? Baby : /меб|furniture|дом|home/.test(normalized) ? Armchair : /спорт|bike/.test(normalized) ? Bike : /инструмент|tool|ремонт/.test(normalized) ? Wrench : /электро|phone/.test(normalized) ? Smartphone : /одеж|camera/.test(normalized) ? Camera : Package; return <div className="marketplaceImagePlaceholder"><Icon size={34} strokeWidth={1.5} /><span>Фото не добавлено</span></div>; }
function conditionLabel(value) { return conditions.slice(1).includes(value) ? value : "Состояние не указано"; }
function formatPrice(amount, transactionType, fallback = "Цена не указана") { const numeric = Number(amount); if (!Number.isFinite(numeric) || numeric <= 0) return fallback; return `${new Intl.NumberFormat("ru-RU").format(numeric)} ₸${transactionType === "rent" || transactionType === "Rent" ? " / день" : ""}`; }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "дата не указана" : date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }); }
function isSafeMarketplaceListing(item) { return item && item.category === "marketplace" && item.marketplace && item.coordinates && Number.isFinite(Number(item.coordinates.lat)) && Number.isFinite(Number(item.coordinates.lng)); }
