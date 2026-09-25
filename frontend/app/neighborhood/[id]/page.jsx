"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bell, CalendarDays, MessageCircle, ShieldCheck } from "lucide-react";
import AktauMap from "../../../components/maps/aktau-map";
import { useAccess } from "../../../components/access-provider";
import { PlatformPageShell } from "../../../components/ui/platform-pages";
import { categoryNames, formatNeighborhoodDate, locationListing, neighborhoodRequest, statusNames, typeNames } from "../../../lib/neighborhood";

export default function CommunityPage() {
  const { access } = useAccess();
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [my, setMy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("map");
  const [noticeFilter, setNoticeFilter] = useState("active");
  const [form, setForm] = useState("report");
  const [category, setCategory] = useState("water");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("building_admin");
  const [origin, setOrigin] = useState(null);
  const [rsvps, setRsvps] = useState(new Set());
  const [affectedIds, setAffectedIds] = useState([]);

  async function refresh() {
    setLoading(true); setError("");
    try {
      const community = await neighborhoodRequest(`/communities/${encodeURIComponent(id)}`);
      setData(community);
      setOrigin({ coordinates: community.location.coordinates, address: community.location.address });
      neighborhoodRequest("/my").then((personal) => { setMy(personal); setRsvps(new Set((personal.rsvps || []).map((item) => item.eventId))); }).catch(() => setMy(null));
    } catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (id) refresh(); }, [id]);

  const following = my?.follows?.find((item) => item.locationId === id);
  const activeRole = my?.roles?.find((item) => item.status === "approved" && [id, ...(data?.ancestors || []).map((parent) => parent.id)].includes(item.locationId) && ["building_admin", "utility_provider", "district_admin"].includes(item.role));
  const canModerate = access?.role === "ADMIN" || my?.roles?.some((item) => item.role === "moderator" && item.status === "approved");
  const mapResult = useMemo(() => ({ input: { city: "Актау" }, market: { map: { center: data?.location?.coordinates || { lat: 43.6532, lng: 51.1975 } } }, competitors: [] }), [data]);
  const mapListings = useMemo(() => (data?.mapLocations || []).map((item) => locationListing(item, data.affectedBuildingIds.includes(item.id))), [data]);
  const visibleAnnouncements = useMemo(() => {
    const announcements = data?.announcements || [];
    if (noticeFilter === "all") return announcements;
    if (noticeFilter === "reported") return announcements.filter((item) => item.verificationLevel === "resident-report");
    if (noticeFilter === "resolved") return announcements.filter((item) => ["resolved", "cancelled"].includes(item.status));
    return announcements.filter((item) => ["planned", "ongoing", "reported"].includes(item.status));
  }, [data, noticeFilter]);
  const activeNoticeCount = (data?.announcements || []).filter((item) => ["planned", "ongoing"].includes(item.status)).length;
  const unconfirmedNoticeCount = (data?.announcements || []).filter((item) => item.verificationLevel === "resident-report").length;
  const upcomingEvents = (data?.events || []).filter((item) => Date.parse(item.startsAt) >= Date.now()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const pastEvents = (data?.events || []).filter((item) => Date.parse(item.startsAt) < Date.now()).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  const nextEvent = upcomingEvents[0];
  const notificationCategories = following?.notificationCategories || Object.keys(categoryNames);

  async function toggleNotificationCategory(value, enabled) {
    const next = enabled ? [...new Set([...notificationCategories, value])] : notificationCategories.filter((item) => item !== value);
    await action(`/follows/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ follow: true, notificationsEnabled: following?.notificationsEnabled !== false, notificationCategories: next }) }, "Темы уведомлений сохранены.");
  }

  async function action(path, options, success) {
    setBusy(true); setNotice("");
    try { await neighborhoodRequest(path, options); setNotice(success); await refresh(); }
    catch (cause) { setNotice(cause.message); }
    finally { setBusy(false); }
  }

  async function submit(event) {
    event.preventDefault();
    const payload = form === "role" ? { role, locationId: id, organizationName: organization, evidence: body } : form === "event" ? { locationId: id, title, description: body, startsAt: startAt, audience: "Жители сообщества" } : form === "discussion" ? { locationId: id, title, body } : { affectedLocationIds: form === "official" && affectedIds.length ? affectedIds : [id], category, title, description: body, ...(form === "official" ? { status: "planned", startAt, expectedEndAt: endAt || null } : {}) };
    const endpoint = { report: "/reports", official: "/announcements", event: "/events", discussion: "/discussions", role: "/roles/applications" }[form];
    const success = { report: "Сообщение жителей опубликовано как неподтверждённое. Официальный статус возможен только после проверки.", official: "Официальное объявление опубликовано для затронутых домов.", event: "Событие отправлено или опубликовано согласно вашим полномочиям.", discussion: "Обсуждение опубликовано.", role: "Заявка на роль отправлена администратору." }[form];
    await action(endpoint, { method: "POST", body: JSON.stringify(payload) }, success);
    setTitle(""); setBody(""); setAffectedIds([]);
  }

  if (loading && !data) return <PlatformPageShell title="Мой район" subtitle="Загружаем сообщество…"><p role="status">Загрузка…</p></PlatformPageShell>;
  if (error && !data) return <PlatformPageShell title="Мой район" subtitle="Не удалось открыть сообщество"><p role="alert">{error}</p><Link href="/neighborhood">Выбрать другой район</Link></PlatformPageShell>;
  if (!data) return null;
  const { location } = data;

  return <PlatformPageShell eyebrow={`${typeNames[location.type]} · Актау`} title={location.name} subtitle={location.address}>
    <div className="neighborhoodBreadcrumb"><Link href="/neighborhood">Мой район</Link>{[...data.ancestors].reverse().filter((item) => item.type !== "city").map((item) => <Link key={item.id} href={`/neighborhood/${encodeURIComponent(item.id)}`}>{item.name}</Link>)}<span>{location.name}</span></div>
    <section className="neighborhoodIntro"><ShieldCheck size={23} /><div><strong>{location.sourceLabel}</strong><p>{location.demo ? "Демонстрационное местоположение. Это не подтверждённый адрес или управляющая организация." : location.verificationStatus === "verified" ? "Данные местоположения проверены." : "Картографические или пользовательские данные; официальный статус территории не подтверждён."}</p></div></section>
    <div className="neighborhoodActions neighborhoodTopActions"><button disabled={busy} onClick={() => action(`/follows/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ follow: !following }) }, following ? "Подписка отключена." : "Вы подписаны на обновления.")}>{following ? "Отписаться" : "Подписаться"}</button>{following && <button disabled={busy} onClick={() => action(`/follows/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ follow: true, notificationsEnabled: !following.notificationsEnabled }) }, "Настройка уведомлений сохранена.")}><Bell size={15} /> Уведомления {following.notificationsEnabled ? "вкл." : "выкл."}</button>}{location.type === "building" && <button disabled={busy || my?.primaryHomeId === id} onClick={() => action(`/follows/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ follow: true, primaryHome: true }) }, "Основной дом сохранён.")}>{my?.primaryHomeId === id ? "Мой основной дом" : "Сделать основным домом"}</button>}{canModerate && <Link href="/neighborhood/moderation">Модерация</Link>}</div>
    <section className="neighborhoodPulse" aria-label="Сводка сообщества"><a href="#community-notices"><strong>{activeNoticeCount}</strong><span>активных работ и проблем</span></a><a href="#community-events"><strong>{nextEvent ? "Скоро" : "—"}</strong><span>{nextEvent ? `Ближайшее событие · ${formatNeighborhoodDate(nextEvent.startsAt)}` : "Предстоящих событий нет"}</span></a><a href="#community-discussions"><strong>{data.discussions.length}</strong><span>обсуждений соседей</span></a>{unconfirmedNoticeCount > 0 && <p>{unconfirmedNoticeCount} {unconfirmedNoticeCount === 1 ? "сообщение от жителя пока не подтверждено." : "сообщения от жителей пока не подтверждены."}</p>}</section>
    {following && <section className="neighborhoodPreferences"><strong>Какие уведомления получать</strong><p>Настройка действует только для этого дома или района.</p><div>{Object.entries(categoryNames).map(([value, label]) => <label key={value}><input type="checkbox" checked={notificationCategories.includes(value)} disabled={busy || !following.notificationsEnabled} onChange={(event) => toggleNotificationCategory(value, event.target.checked)} />{label}</label>)}</div></section>}
    {notice && <p className="neighborhoodNotice" role="status">{notice}</p>}
    <div className="neighborhoodViewSwitch"><button className={view === "map" ? "active" : ""} onClick={() => setView("map")}>Карта</button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>Лента</button></div>
    <div className={`neighborhoodGrid neighborhoodView-${view}`}><div className="neighborhoodMap"><AktauMap result={mapResult} listings={mapListings} searchOrigin={origin} onSearchOriginChange={setOrigin} selectedListingId={selectedId} onListingSelect={(item) => setSelectedId(item.id)} radiusKm={5} /></div><div className="neighborhoodList"><h2>Территории</h2>{selectedId && <p className="neighborhoodNotice">Выбрано на карте: {mapListings.find((item) => item.id === selectedId)?.title}</p>}{data.children.length ? data.children.map((item) => <article className={`neighborhoodCard ${selectedId === item.id ? "selected" : ""}`} key={item.id}><span className="neighborhoodBadge">{typeNames[item.type]}</span><h3>{item.name}</h3><p>{item.sourceLabel}</p><div className="neighborhoodActions"><Link href={`/neighborhood/${encodeURIComponent(item.id)}`}>Открыть</Link><button onClick={() => { setSelectedId(item.id); setView("map"); }}>На карте</button></div></article>) : <p>Вложенных территорий пока нет.</p>}</div></div>
    <section className="neighborhoodSection" id="community-notices"><div className="neighborhoodSectionHeading"><h2>Объявления и коммунальные работы</h2><label>Показать <select value={noticeFilter} onChange={(event) => setNoticeFilter(event.target.value)}><option value="active">Актуальное</option><option value="all">Всё</option><option value="reported">Сообщения жителей</option><option value="resolved">Завершённое</option></select></label></div>{visibleAnnouncements.length ? visibleAnnouncements.map((item) => <article className="neighborhoodCard" key={item.id}><div><span className="neighborhoodBadge">{categoryNames[item.category] || item.category}</span><span className={item.verificationLevel === "resident-report" ? "neighborhoodUnverified" : "neighborhoodVerified"}>{item.sourceLabel}</span></div><h3>{item.title}</h3><p>{item.description}</p><dl><div><dt>Статус</dt><dd>{statusNames[item.status]}</dd></div><div><dt>Начало</dt><dd>{formatNeighborhoodDate(item.startAt)}</dd></div><div><dt>Ожидаемое окончание</dt><dd>{formatNeighborhoodDate(item.expectedEndAt)}</dd></div><div><dt>Затронутая территория</dt><dd>{item.affectedLocationIds.map((locationId) => data.mapLocations.find((entry) => entry.id === locationId)?.name || locationId).join(", ")}</dd></div></dl>{item.verificationLevel === "resident-report" && my?.roles?.some((role) => role.status === "approved" && ["utility_provider", "district_admin"].includes(role.role)) && <button disabled={busy} onClick={() => action(`/reports/${item.id}/confirm`, { method: "POST" }, "Сообщение подтверждено.")}>Подтвердить как представитель</button>}</article>) : <p>{noticeFilter === "active" ? "Актуальных сообщений пока нет." : "Сообщений в этой выборке пока нет."}</p>}</section>
    <section className="neighborhoodSection" id="community-events"><h2><CalendarDays size={19} /> Ближайшие события</h2>{upcomingEvents.length ? upcomingEvents.map((item) => <article className="neighborhoodCard" key={item.id}><span className="neighborhoodBadge">{item.sourceLabel}</span><h3>{item.title}</h3><p>{item.description}</p><p>{formatNeighborhoodDate(item.startsAt)} · {item.organizer}</p><button disabled={busy} onClick={() => action(`/events/${item.id}/rsvp`, { method: "PUT", body: JSON.stringify({ attending: !rsvps.has(item.id) }) }, rsvps.has(item.id) ? "Участие отменено." : "Вы записаны. Напомним за сутки.")}>{rsvps.has(item.id) ? "Отменить участие" : "Буду участвовать"}</button></article>) : <p>Предстоящих событий пока нет.</p>}{pastEvents.length > 0 && <details className="neighborhoodEventHistory"><summary>Прошедшие события · {pastEvents.length}</summary>{pastEvents.map((item) => <article className="neighborhoodCard" key={item.id}><span className="neighborhoodBadge">{item.sourceLabel}</span><h3>{item.title}</h3><p>{item.description}</p><small>{formatNeighborhoodDate(item.startsAt)} · {item.organizer}</small></article>)}</details>}</section>
    <section className="neighborhoodSection" id="community-discussions"><h2><MessageCircle size={19} /> Обсуждения соседей</h2>{data.discussions.length ? data.discussions.map((item) => <article className="neighborhoodCard" key={item.id}><h3>{item.title}</h3><p>{item.body}</p><small>{item.authorLabel} · {formatNeighborhoodDate(item.createdAt)}</small></article>) : <p>Начните первое обсуждение.</p>}</section>
    <section className="neighborhoodSection"><h2>Новое сообщение</h2><div className="neighborhoodTabs">{[["report", "Сообщить о проблеме"], ["event", "Предложить событие"], ["discussion", "Обсуждение"], ["role", "Заявка представителя"], ...(activeRole ? [["official", "Официальное объявление"]] : [])].map(([key, label]) => <button className={form === key ? "active" : ""} key={key} onClick={() => setForm(key)}>{label}</button>)}</div><form className="neighborhoodForm" onSubmit={submit}>{form === "official" && <fieldset className="neighborhoodAffected"><legend>Затронутые дома и территории</legend><p>Если ничего не выбрано, уведомление относится к текущему сообществу.</p>{data.mapLocations.filter((item) => item.type === "building" || item.type === "complex").map((item) => <label key={item.id}><input type="checkbox" checked={affectedIds.includes(item.id)} onChange={(event) => setAffectedIds((current) => event.target.checked ? [...current, item.id] : current.filter((value) => value !== item.id))} /> {item.name}</label>)}</fieldset>}{form === "role" ? <><select value={role} onChange={(event) => setRole(event.target.value)}><option value="building_admin">Администратор дома / ЖК</option><option value="utility_provider">Коммунальная служба</option><option value="district_admin">Представитель района</option><option value="moderator">Модератор</option></select><input required minLength={2} maxLength={120} placeholder="Организация" value={organization} onChange={(event) => setOrganization(event.target.value)} /></> : <>{["report", "official"].includes(form) && <select value={category} onChange={(event) => setCategory(event.target.value)}>{Object.entries(categoryNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}<input required minLength={5} maxLength={140} placeholder="Заголовок" value={title} onChange={(event) => setTitle(event.target.value)} /></>}{["event", "official"].includes(form) && <label>Начало <input required type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></label>}{form === "official" && <label>Ожидаемое окончание <input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} /></label>}<textarea required minLength={form === "role" ? 15 : 10} maxLength={form === "role" ? 1000 : 2000} placeholder={form === "role" ? "Подтверждение полномочий" : "Описание"} value={body} onChange={(event) => setBody(event.target.value)} /><p>{form === "report" ? "Сообщение получит пометку «не подтверждено». Уведомления о коммунальных работах рассылают только после подтверждения." : form === "role" ? "Роль активирует администратор после проверки полномочий." : "Указывайте только сведения, которые можно публиковать соседям. Не сообщайте номера квартир и личные контакты."}</p><button disabled={busy} type="submit">{busy ? "Отправляем…" : "Отправить"}</button></form></section>
    <section className="neighborhoodSection"><h2>Важные контакты</h2>{data.contacts.length ? data.contacts.map((contact) => <p key={contact.name}>{contact.name}: {contact.phone}</p>) : <p>Проверенные контакты для этой территории ещё не добавлены.</p>}</section>
  </PlatformPageShell>;
}
