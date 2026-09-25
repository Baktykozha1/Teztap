"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Droplets, Flame, MapPinned, Plus, Road, Search, Wifi, Zap } from "lucide-react";
import AktauMap from "../../components/maps/aktau-map";
import { PlatformPageShell } from "../../components/ui/platform-pages";
import { categoryNames, locationListing, neighborhoodRequest, typeNames } from "../../lib/neighborhood";

const center = { coordinates: { lat: 43.6532, lng: 51.1975 }, address: "Актау" };
const result = { input: { city: "Актау" }, market: { map: { center: center.coordinates } }, competitors: [] };

export default function NeighborhoodPage() {
  const [locations, setLocations] = useState([]);
  const [issues, setIssues] = useState([]);
  const [my, setMy] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [origin, setOrigin] = useState(center);
  const [radius, setRadius] = useState(15);
  const [view, setView] = useState("map");
  const [suggest, setSuggest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState({ type: "building", parentId: "", name: "", address: "" });

  async function refresh() {
    setStatus("loading"); setError("");
    try {
      const [data, issueData] = await Promise.all([neighborhoodRequest("/locations"), neighborhoodRequest("/issues")]);
      setLocations(data.items || []);
      setIssues(issueData.items || []);
      setStatus("ready");
      neighborhoodRequest("/my").then(setMy).catch(() => setMy(null));
    } catch (cause) { setError(cause.message); setStatus("error"); }
  }
  useEffect(() => { refresh(); }, []);
  const visible = useMemo(() => locations.filter((item) => item.type !== "city" && (type === "all" || item.type === type) && `${item.name} ${item.address}`.toLocaleLowerCase("ru-RU").includes(query.toLocaleLowerCase("ru-RU")) && distanceKm(origin.coordinates, item.coordinates) <= radius), [locations, type, query, origin, radius]);
  const selected = locations.find((item) => item.id === selectedId);
  const follows = new Set((my?.follows || []).map((item) => item.locationId));
  const myLocations = (my?.follows || []).map((item) => ({ ...item, location: locations.find((location) => location.id === item.locationId) })).filter((item) => item.location);
  const issueCounts = Object.fromEntries(Object.keys(categoryNames).map((key) => [key, issues.filter((item) => item.category === key).length]));
  const issueIcons = { water: Droplets, electricity: Zap, heating: Flame, gas: Flame, internet: Wifi, elevator: Building2, road: Road, cleaning: CheckCircle2, other: MapPinned };

  async function follow(location, options) {
    setBusy(true); setMessage("");
    try {
      await neighborhoodRequest(`/follows/${encodeURIComponent(location.id)}`, { method: "PUT", body: JSON.stringify(options) });
      setMy(await neighborhoodRequest("/my"));
      setMessage(options.follow === false ? "Вы больше не подписаны на обновления." : options.primaryHome ? "Основной дом сохранён." : "Подписка сохранена.");
    } catch (cause) { setMessage(cause.message); }
    finally { setBusy(false); }
  }

  async function submitSuggestion(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await neighborhoodRequest("/locations/suggestions", { method: "POST", body: JSON.stringify({ ...draft, coordinates: origin.coordinates }) });
      setSuggest(false); setMessage("Место отправлено на проверку. До подтверждения оно не появится на карте.");
    } catch (cause) { setMessage(cause.message); }
    finally { setBusy(false); }
  }

  return <PlatformPageShell eyebrow="Сообщество Актау" title="Мой район" subtitle="Новости дома, планы коммунальных служб, события и обсуждения жителей на общей карте TezTap.">
    <section className="neighborhoodIntro"><Building2 size={24} /><div><strong>Выберите район, ЖК или дом</strong><p>Несколько подписок, один основной дом. Данные OSM и демонстрационные адреса отмечены отдельно. Домашний адрес не показывается другим жителям.</p></div></section>
    <section className="neighborhoodIssueHub"><div className="neighborhoodSectionHeading"><div><span>ОБЩИЙ ГОРОДСКОЙ ФИД</span><h2>Сообщества городских проблем</h2></div><Link href="/neighborhood/issues">Все темы <MapPinned size={14} /></Link></div><p>Публикуйте локальные проблемы в тематические ленты. Непроверенные сообщения видны отдельно от объявлений служб.</p><div className="neighborhoodIssueChannels">{Object.entries(categoryNames).map(([key, label]) => { const Icon = issueIcons[key] || MapPinned; return <Link key={key} href={`/neighborhood/issues?category=${encodeURIComponent(key)}`}><Icon size={18} /><span><strong>{label}</strong><small>{issueCounts[key] || 0} сообщений</small></span><b>›</b></Link>; })}</div></section>
    {myLocations.length > 0 && <section className="neighborhoodMyCommunities"><div className="neighborhoodSectionHeading"><div><span>ВАШИ ПОДПИСКИ</span><h2>Мои сообщества</h2></div><span>{myLocations.length}</span></div><div className="neighborhoodMyCommunityGrid">{myLocations.map(({ location, primaryHome, notificationsEnabled }) => <article key={location.id}><div><span className="neighborhoodBadge">{typeNames[location.type]}</span>{primaryHome && <span className="neighborhoodVerified">Мой дом</span>}</div><h3>{location.name}</h3><p>{location.address}</p><small>Уведомления {notificationsEnabled === false ? "выключены" : "включены"}</small><div className="neighborhoodActions"><Link href={`/neighborhood/${encodeURIComponent(location.id)}`}>Открыть ленту</Link><button type="button" disabled={busy} onClick={() => follow(location, { follow: false })}>Отписаться</button></div></article>)}</div></section>}
    <div className="neighborhoodControls"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название района, ЖК или дома" aria-label="Поиск района" /></label><select value={type} onChange={(event) => setType(event.target.value)} aria-label="Тип территории"><option value="all">Все территории</option>{Object.entries(typeNames).filter(([key]) => key !== "city").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><label>Радиус <select value={radius} onChange={(event) => setRadius(Number(event.target.value))}>{[2, 5, 10, 15, 25, 50].map((km) => <option key={km} value={km}>{km} км</option>)}</select></label><button type="button" onClick={() => setSuggest((value) => !value)}><Plus size={16} /> Предложить адрес</button></div>
    {message && <p className="neighborhoodNotice" role="status">{message}</p>}
    {suggest && <form className="neighborhoodForm" onSubmit={submitSuggestion}><h2>Предложить отсутствующее место</h2><p>Выберите точку на карте. Адрес появится после проверки модератором.</p><select required value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value, parentId: "" })}><option value="building">Дом</option><option value="complex">ЖК</option><option value="microdistrict">Микрорайон</option></select><select required value={draft.parentId} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}><option value="">Родительская территория</option>{locations.filter((item) => draft.type === "microdistrict" ? item.type === "city" : draft.type === "complex" ? item.type === "microdistrict" : ["microdistrict", "complex"].includes(item.type)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input required minLength={2} maxLength={120} placeholder="Название" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><input required minLength={2} maxLength={180} placeholder="Адрес или район" value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /><span>Точка: {origin.coordinates.lat.toFixed(4)}, {origin.coordinates.lng.toFixed(4)}</span><button disabled={busy} type="submit">Отправить на проверку</button></form>}
    {status === "loading" && <p role="status">Загружаем территории Актау…</p>}{status === "error" && <div role="alert">{error} <button onClick={refresh}>Повторить</button></div>}
    <div className="neighborhoodViewSwitch"><button className={view === "map" ? "active" : ""} onClick={() => setView("map")}>Карта</button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>Список</button></div>
    <div className={`neighborhoodGrid neighborhoodView-${view}`}><div className="neighborhoodMap"><AktauMap result={result} listings={visible.map((item) => locationListing(item))} searchOrigin={origin} onSearchOriginChange={setOrigin} selectedListingId={selectedId} onListingSelect={(item) => setSelectedId(item.id)} radiusKm={radius} /></div><div className="neighborhoodList">{selected && <p className="neighborhoodNotice"><MapPinned size={15} /> На карте выбран: <Link href={`/neighborhood/${encodeURIComponent(selected.id)}`}>{selected.name}</Link></p>}{status === "ready" && !visible.length && <p>В этом радиусе нет территорий. Измените фильтры или предложите адрес.</p>}{visible.map((item) => <article className={`neighborhoodCard ${selectedId === item.id ? "selected" : ""}`} key={item.id}><div><span className="neighborhoodBadge">{typeNames[item.type]}</span><span className="neighborhoodSource">{item.sourceLabel}</span></div><h2>{item.name}</h2><p>{item.address}</p><small>{distanceKm(origin.coordinates, item.coordinates).toFixed(1)} км от центра поиска</small><div className="neighborhoodActions"><Link href={`/neighborhood/${encodeURIComponent(item.id)}`}>Открыть сообщество</Link><button disabled={busy} onClick={() => follow(item, { follow: !follows.has(item.id) })}>{follows.has(item.id) ? "Отписаться" : "Подписаться"}</button>{item.type === "building" && <button disabled={busy || my?.primaryHomeId === item.id} onClick={() => follow(item, { follow: true, primaryHome: true })}>{my?.primaryHomeId === item.id ? "Основной дом" : "Мой дом"}</button>}<button onClick={() => { setSelectedId(item.id); setView("map"); }}>На карте</button></div></article>)}</div></div><p className="neighborhoodSourceNote">Карта © OpenStreetMap. Адреса OSM не подтверждают организацию или администратора. Демо-точки служат только примером.</p>
  </PlatformPageShell>;
}

function distanceKm(a, b) { const radians = Math.PI / 180; const dLat = (b.lat - a.lat) * radians; const dLng = (b.lng - a.lng) * radians; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
