"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Heart, MapPin, MessageCircle, Navigation, Star } from "lucide-react";
import { scoreListing } from "../../lib/discovery";
import { useWorkspace } from "../workspace-provider";

export function useDiscoveryFavorites() {
  const { workspace, loading, toggleFavorite } = useWorkspace();
  const ids = workspace.favorites;
  return { ids, ready: !loading, toggle: toggleFavorite, isFavorite: (id) => ids.includes(id) };
}

export function LocationSearch({ value, onChange, onLocationSelect }) {
  return (
    <label className="discoverySearch">
      <MapPin size={17} aria-hidden="true" />
      <span className="srOnly">Поиск по Актау или району</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && value.trim()) { event.preventDefault(); onLocationSelect?.(value.trim()); } }} placeholder="Актау или район · Enter для поиска на карте" />
      <Navigation size={15} aria-hidden="true" />
    </label>
  );
}

export function DiscoveryFilters({ types, selectedType, onTypeChange, sort, onSortChange }) {
  const options = [{ value: "All", label: "Все" }, ...types.map((type) => typeof type === "string" ? { value: type, label: type } : { value: type.key, label: type.label })];
  return (
    <div className="discoveryFilters">
      <div className="discoveryTypeFilters" aria-label="Фильтр по категории">
        {options.map((type) => <button type="button" key={type.value} className={selectedType === type.value ? "active" : ""} onClick={() => onTypeChange(type.value)}>{type.label}</button>)}
      </div>
      <label className="discoverySort">Сортировка
        <select value={sort} onChange={(event) => onSortChange(event.target.value)}>
          <option value="recommended">Рекомендации</option>
          <option value="price">Сначала дешевле</option>
          <option value="distance">Ближе</option>
          <option value="rating">По рейтингу</option>
        </select>
      </label>
    </div>
  );
}

export function RecommendationScore({ score }) {
  return <span className="recommendationScore" aria-label={`Оценка TezTap: ${score} из 100`}><span>Оценка TezTap</span><strong>{score}<small>/100</small></strong></span>;
}

export function RatingAndReviews({ rating, count, summary, demo = false }) {
  const [open, setOpen] = useState(false);
  const hasRating = rating !== null && rating !== undefined && rating !== "" && Number.isFinite(Number(rating));
  return (
    <div className="reviewSummary">
      <button type="button" className="reviewToggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <Star size={15} fill="currentColor" /><strong>{hasRating ? Number(rating).toFixed(1) : "—"}</strong><span>{count == null ? "Количество отзывов неизвестно" : `${count} ${demo ? "демо-отзывов" : "отзывов"}`}</span>
      </button>
      {open && <p><MessageCircle size={14} />{summary}</p>}
    </div>
  );
}

export function FavoriteButton({ active, onClick }) {
  return <button type="button" className={`favoriteButton ${active ? "active" : ""}`} aria-pressed={active} aria-label={active ? "Убрать из избранного" : "Добавить в избранное"} onClick={onClick}><Heart size={18} fill={active ? "currentColor" : "none"} /></button>;
}

export function ListingCard({ id, listing, favorite, onToggleFavorite, onViewOnMap, applied = false, onQuickApply, selected = false, scoreContext }) {
  const item = scoreListing(listing, scoreContext);
  return (
    <article id={id} className={`discoveryListingCard ${selected ? "selected" : ""}`} aria-current={selected ? "true" : undefined}>
      <div className="listingCardTop">
        <span className={listing.demo ? "demoBadge" : "dataSourceBadge"}>{listing.demo ? "ДЕМО · НЕ ПРОВЕРЕНО" : listing.sourceLabel || "Публичные данные"}</span>
        <FavoriteButton active={favorite} onClick={() => onToggleFavorite(listing.id)} />
      </div>
      <div className="listingHeading"><div><span className="listingSubtype">{listing.subtypeLabel || listing.subtype}</span><h3>{listing.title}</h3><p className="listingProvider">{listing.provider}</p></div><RecommendationScore score={item.recommendationScore} /></div>
      <p className="listingDescription">{listing.description}</p>
      <div className="listingPlace"><MapPin size={15} />{listing.district || listing.address || "Актау"} <span>·</span>{item.distanceKm == null ? "расстояние неизвестно" : `${item.distanceKm.toFixed(1)} км от точки поиска`}</div>
      <div className="listingTags">{(listing.tags || []).map((tag) => <span key={tag}>{tag}</span>)}</div>
      <div className="listingCardBottom"><strong>{listing.priceLabel || "Цена не указана"}</strong><RatingAndReviews rating={listing.rating} count={listing.ratingCount} summary={listing.reviewSummary || "Нет подтверждённого отзыва."} demo={listing.demo} /></div>
      <small className="recordSource">Источник: {listing.sourceLabel || (listing.demo ? "Демо-данные MVP · не подтверждено" : "внутренний каталог")}{listing.lastUpdatedAt ? ` · обновлено ${new Date(listing.lastUpdatedAt).toLocaleString("ru-RU")}` : ""}</small>
      <RecommendationDetails item={item} />
      <div className="listingActions">{directionsUrl(listing) ? <><Link href="#directory-map" onClick={() => onViewOnMap(listing)}>На карте TezTap <Navigation size={14} /></Link><a href={directionsUrl(listing)} target="_blank" rel="noreferrer">Маршрут <ExternalLink size={13} /></a></> : <span>Местоположение не указано</span>}{listing.category === "jobs" ? <button type="button" className="quickApplyButton" onClick={() => onQuickApply(listing.id)} disabled={applied}>{applied ? "Сохранено на устройстве" : "Откликнуться · демо"}</button> : <span>Демо-взаимодействие</span>}</div>
    </article>
  );
}

export function RecommendationDetails({ item }) {
  return (
    <details className="recommendationDetails">
      <summary>Почему TezTap рекомендует</summary>
      <p>{item.recommendationExplanation}</p>
      <div><strong>Преимущества</strong>{item.recommendationAdvantages.length ? <ul>{item.recommendationAdvantages.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <span>Нет подтверждённых преимуществ по текущим данным.</span>}</div>
      <div><strong>Что учесть</strong>{item.recommendationDisadvantages.length ? <ul>{item.recommendationDisadvantages.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <span>Замечаний по доступным данным нет.</span>}</div>
      <div className="recommendationFactorList"><strong>Факторы исходной формулы</strong>{item.recommendationFactors.map((factor) => <div key={factor.key}><span>{factor.label}</span><span>{Math.round(factor.score)} / {factor.maxScore}</span><i><b style={{ width: `${factor.maxScore ? Math.min(100, factor.score / factor.maxScore * 100) : 0}%` }} /></i></div>)}<small>Цена и актуальная доступность показаны отдельно и не меняют исходную оценку TezTap.</small></div>
    </details>
  );
}

export function TezTapAskPanel({ value, onChange, onSubmit, onClear, handoffUrl, discoveryContext, interpretedLabel = "" }) {
  function preserveContext() {
    try {
      window.sessionStorage.setItem("mercora.discovery.ai-context.v1", JSON.stringify(discoveryContext || null));
    } catch { /* AI handoff remains usable if browser storage is unavailable. */ }
  }
  return (
    <section className="mercoraAskPanel" aria-labelledby="mercora-ask-title">
      <div className="mercoraAskHeading"><span>✦</span><div><h2 id="mercora-ask-title">Спросите TezTap</h2><p>Опишите задачу обычными словами — подберём варианты и объясним оценку.</p></div></div>
      <form className="mercoraAskForm" onSubmit={onSubmit}>
        <input value={value} onChange={(event) => onChange(event.target.value)} aria-label="Ваш запрос TezTap" placeholder="Например: недорогой спортзал рядом, открыт после 22:00" />
        <button type="submit" disabled={!value.trim()}>Подобрать</button>
      </form>
      {interpretedLabel && <p className="mercoraIntentSummary">{interpretedLabel}</p>}
      {value.trim() && interpretedLabel && <div className="mercoraAiActions"><Link className="mercoraAiHandoff" href={handoffUrl} onClick={preserveContext}>Продолжить в AI-консультанте TezTap <ExternalLink size={14} /></Link><button type="button" onClick={onClear}>Очистить запрос</button></div>}
    </section>
  );
}

function directionsUrl(listing) {
  const point = listing.coordinates || { lat: listing.latitude, lng: listing.longitude };
  if (point?.lat == null || point?.lng == null || !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng))) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${point.lat},${point.lng}`)}`;
}
