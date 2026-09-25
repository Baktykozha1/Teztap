"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CalendarClock, CheckCircle2, CircleAlert, Droplets, Flame, MapPin, MessageSquareText, Road, Send, ShieldCheck, Wifi, Zap } from "lucide-react";
import AktauMap from "../../../components/maps/aktau-map";
import { useAccess } from "../../../components/access-provider";
import { PlatformPageShell } from "../../../components/ui/platform-pages";
import { categoryNames, formatNeighborhoodDate, neighborhoodRequest, statusNames } from "../../../lib/neighborhood";

const city = { lat: 43.6532, lng: 51.1975 };
const channelIcons = { water: Droplets, electricity: Zap, heating: Flame, gas: Flame, internet: Wifi, elevator: Building2, road: Road, cleaning: CheckCircle2, other: CircleAlert };
const emptyDraft = { title: "", description: "", locationId: "aktau" };

export default function CityIssuesPage() {
  const { user } = useAccess();
  const [category, setCategory] = useState("water");
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("category");
    if (requested && Object.hasOwn(categoryNames, requested)) setCategory(requested);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [issues, places] = await Promise.all([neighborhoodRequest("/issues"), neighborhoodRequest("/locations")]);
      setItems(issues.items || []);
      setLocations(places.items || []);
      if (user?.id) {
        const mine = await neighborhoodRequest("/my").catch(() => null);
        setSubscriptions(mine?.issueSubscriptions?.map((item) => item.category) || []);
      }
    } catch (cause) { setError(cause.message || "Не удалось загрузить городскую ленту."); }
    finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => items.filter((item) => item.category === category), [items, category]);
  const markers = useMemo(() => visible.map((item) => ({
    id: item.id,
    category: "neighborhood-alert",
    title: item.title,
    address: item.address,
    district: item.address,
    coordinates: item.coordinates || city,
    sourceLabel: item.sourceLabel,
    description: `${categoryNames[item.category] || "Городская проблема"} · ${statusNames[item.status] || item.status}`,
    demo: false
  })), [visible]);
  const result = useMemo(() => ({ input: { city: "Актау" }, market: { map: { center: city } }, competitors: [] }), []);
  const counts = useMemo(() => Object.fromEntries(Object.keys(categoryNames).map((key) => [key, items.filter((item) => item.category === key).length])), [items]);

  async function toggleSubscription() {
    if (!user?.id) { setNotice("Войдите в аккаунт, чтобы подписаться на тему и получать уведомления."); return; }
    setBusy(true); setNotice("");
    try {
      const follow = !subscriptions.includes(category);
      await neighborhoodRequest(`/issue-subscriptions/${encodeURIComponent(category)}`, { method: "PUT", body: JSON.stringify({ follow }) });
      setSubscriptions((current) => follow ? [...new Set([...current, category])] : current.filter((item) => item !== category));
      setNotice(follow ? `Вы подписались на обновления: ${categoryNames[category]}.` : "Подписка на эту тему отключена.");
    } catch (cause) { setNotice(cause.message); }
    finally { setBusy(false); }
  }

  async function submit(event) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      await neighborhoodRequest("/reports", { method: "POST", body: JSON.stringify({ category, affectedLocationIds: [draft.locationId], title: draft.title, description: draft.description }) });
      setDraft(emptyDraft); setShowForm(false);
      setNotice("Проблема опубликована с пометкой «не подтверждено». Когда её подтвердит уполномоченная служба, подписчики темы получат уведомление.");
      await load();
    } catch (cause) { setNotice(cause.message || "Не удалось опубликовать сообщение."); }
    finally { setBusy(false); }
  }

  return <PlatformPageShell eyebrow="Сообщества Актау" title="Проблемы города" subtitle="Тематические ленты воды, электричества и других городских служб. Сообщения жителей отделены от подтверждённых объявлений.">
    <div className="neighborhoodBreadcrumb"><Link href="/neighborhood">Мой район</Link><span>Городские проблемы</span></div>
    <section className="cityIssueChannels" aria-label="Тематические сообщества">
      {Object.entries(categoryNames).map(([key, label]) => {
        const Icon = channelIcons[key] || CircleAlert;
        return <button type="button" className={category === key ? "active" : ""} key={key} onClick={() => { setCategory(key); setSelectedId(null); setNotice(""); }} aria-pressed={category === key}>
          <Icon size={19} /><span><strong>{label}</strong><small>{counts[key] || 0} сообщений по Актау</small></span><b>{counts[key] || 0}</b>
        </button>;
      })}
    </section>
    <section className="cityIssueIntro"><div><span>ТЕМА СООБЩЕСТВА</span><h2>{categoryNames[category]}</h2><p>Сообщите, где возникла проблема. Пост появится в городской ленте, а точка будет отмечена на общей карте.</p></div><div className="cityIssueActions"><button type="button" disabled={busy} onClick={toggleSubscription}><CalendarClock size={16} />{subscriptions.includes(category) ? "Отписаться от темы" : "Следить за темой"}</button><button type="button" className="primary" onClick={() => setShowForm((value) => !value)}><MessageSquareText size={16} />Сообщить о проблеме</button></div></section>
    {notice && <p className="neighborhoodNotice" role="status">{notice}</p>}
    {showForm && <form className="neighborhoodForm cityIssueForm" onSubmit={submit}><h2>Новое сообщение · {categoryNames[category]}</h2><label>Где проблема<select required value={draft.locationId} onChange={(event) => setDraft((current) => ({ ...current, locationId: event.target.value }))}><option value="aktau">Весь Актау</option>{locations.filter((item) => item.type !== "city").map((item) => <option key={item.id} value={item.id}>{item.name} · {item.address}</option>)}</select></label><label>Коротко опишите проблему<input required minLength={5} maxLength={140} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Например, нет воды в доме" /></label><label>Подробности<textarea required minLength={10} maxLength={2000} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Когда началось и кого затронуло? Не указывайте номер квартиры и личные контакты." /></label><p><ShieldCheck size={15} /> Сообщение сразу видно соседям, но оно будет явно помечено как неподтверждённое. Не публикуйте персональные данные.</p><button disabled={busy} type="submit"><Send size={15} />{busy ? "Публикуем…" : "Опубликовать сообщение"}</button></form>}
    {error && <p className="neighborhoodNotice" role="alert">{error} <button type="button" onClick={load}>Повторить</button></p>}
    <div className="cityIssueLayout"><section className="cityIssueFeed" aria-label={`Лента: ${categoryNames[category]}`}><div className="neighborhoodSectionHeading"><div><span>ГОРОДСКАЯ ЛЕНТА</span><h2>{visible.length} сообщений</h2></div></div>{loading ? <p role="status">Загружаем городские сообщения…</p> : visible.length ? visible.map((item) => <article className={`neighborhoodCard ${selectedId === item.id ? "selected" : ""}`} key={item.id}><div><span className={item.verificationLevel === "resident-report" ? "neighborhoodUnverified" : "neighborhoodVerified"}>{item.sourceLabel}</span><span className="neighborhoodBadge">{statusNames[item.status] || item.status}</span></div><button type="button" className="cityIssueSelect" aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)}><h3>{item.title}</h3></button><p>{item.description}</p><div className="cityIssueMeta"><span><MapPin size={13} />{item.address || "Актау"}</span><span>{formatNeighborhoodDate(item.publishedAt)}</span></div>{item.affectedLocations?.[0] && <Link href={`/neighborhood/${encodeURIComponent(item.affectedLocations[0].id)}`}>Открыть сообщество территории</Link>}</article>) : <div className="neighborhoodCard"><strong>В этой теме пока нет сообщений</strong><p>Если проблема актуальна, добавьте сообщение для соседей и отметьте место на карте.</p></div>}</section>
      <section className="cityIssueMap"><div className="directoryMapHeading"><div><span>ОБЩАЯ КАРТА TEZTAP</span><h3>{categoryNames[category]} · Актау</h3></div><MapPin size={18} /></div><AktauMap result={result} listings={markers} searchOrigin={{ coordinates: city, address: "Актау" }} selectedListingId={selectedId} onListingSelect={(item) => setSelectedId(item.id)} radiusKm={50} /><p className="neighborhoodSourceNote">Точки показывают территорию проблемы, а не частный адрес. Подтверждённость указана в каждой карточке.</p></section></div>
  </PlatformPageShell>;
}
