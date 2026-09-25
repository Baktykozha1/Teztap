"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Bookmark, BriefcaseBusiness, Check, Clock3, Heart, MapPinned, MessageCircle, Send, ShieldCheck, Star, UserRound } from "lucide-react";
import { PlatformPageShell } from "../../components/ui/platform-pages";
import { useAccess } from "../../components/access-provider";
import { useWorkspace } from "../../components/workspace-provider";

const tabs = [
  ["profile", "Профиль", UserRound], ["favorites", "Избранное", Heart], ["activity", "История", Clock3],
  ["messages", "Чаты", MessageCircle], ["filters", "Фильтры", Bookmark], ["notifications", "Уведомления", Bell], ["reviews", "Отзывы", Star]
];

export default function ProfilePage() {
  const { user, access, refresh } = useAccess();
  const { workspace, loading, syncStatus, setNotice, setLocation, addReview, sendMessage, markNotificationRead, updateSection } = useWorkspace();
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState({ name: "", company: "", phone: "", about: "" });
  const [location, setLocationForm] = useState(workspace.location);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(false);
  const [review, setReview] = useState({ listingTitle: "", category: "places", rating: "5", text: "" });
  const [message, setMessage] = useState({ recipient: "", category: "", text: "" });
  const unread = workspace.notifications.filter((item) => !item.read).length;

  useEffect(() => setProfile({ name: user?.name || "", company: user?.company || "", phone: user?.profile?.phone || "", about: user?.profile?.about || "" }), [user?.id, user?.name, user?.company, user?.profile?.phone, user?.profile?.about]);
  useEffect(() => { if (user?.id) return; try { const savedProfile = JSON.parse(window.localStorage.getItem("mercora.profile.guest.v1") || "null"); if (savedProfile) setProfile((current) => ({ ...current, ...savedProfile })); } catch { /* A blank guest profile remains usable. */ } }, [user?.id]);
  useEffect(() => setLocationForm(workspace.location), [workspace.location]);

  async function saveProfile(event) {
    event.preventDefault(); setFormError(""); setSaved(false);
    const name = profile.name.trim();
    if (name.length < 2 || name.length > 100) { setFormError("Имя должно содержать от 2 до 100 символов."); return; }
    if (profile.phone && !/^\+?[0-9 ()-]{7,32}$/.test(profile.phone.trim())) { setFormError("Проверьте формат телефона."); return; }
    try {
      if (user?.id) {
        const response = await fetch("/api/me/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...profile, name }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Не удалось сохранить профиль.");
        await refresh();
      } else {
        window.localStorage.setItem("mercora.profile.guest.v1", JSON.stringify({ ...profile, name }));
      }
      setSaved(true); setNotice("Профиль сохранён.");
    } catch (error) { setFormError(error.message || "Не удалось сохранить профиль. Попробуйте ещё раз."); }
  }

  function saveLocation(event) {
    event.preventDefault(); setFormError("");
    if (!setLocation(location)) setFormError("Укажите город и радиус от 1 до 25 км.");
  }

  function submitReview(event) {
    event.preventDefault(); setFormError("");
    const ok = addReview({ ...review, rating: Number(review.rating), category: review.category.trim() });
    if (ok) { setReview({ listingTitle: "", category: "places", rating: "5", text: "" }); setSaved(true); }
  }

  function submitMessage(event) {
    event.preventDefault(); setFormError("");
    const recipient = message.recipient.trim();
    if (recipient.length < 2 || message.text.trim().length < 1) { setFormError("Укажите получателя и напишите сообщение."); return; }
    if (sendMessage({ threadId: `manual:${recipient.toLowerCase()}`, recipient, title: recipient, category: message.category, text: message.text })) {
      setMessage({ recipient: "", category: "", text: "" }); setSaved(true);
    }
  }

  return <PlatformPageShell eyebrow="Ваш TezTap" title="Профиль и сохранённое" subtitle="Одна учётная запись, настройки местоположения и история действий во всех разделах.">
    <div className="workspaceStatus" role="status"><span className={syncStatus === "synced" ? "online" : ""} />{loading ? "Загружаем профиль…" : syncStatus === "synced" ? "Синхронизировано с аккаунтом TezTap" : syncStatus === "saving" ? "Сохраняем…" : user?.id ? "Локально · синхронизация временно недоступна" : "Гостевой режим · данные на этом устройстве"}</div>
    <nav className="workspaceTabs" aria-label="Разделы профиля">{tabs.map(([key, label, Icon]) => <button type="button" key={key} className={tab === key ? "active" : ""} onClick={() => { setTab(key); setFormError(""); }}><Icon size={16} />{label}{key === "notifications" && unread > 0 ? <b>{unread}</b> : null}</button>)}</nav>
    {formError && <p className="workspaceError" role="alert">{formError}</p>}{saved && <p className="workspaceSuccess" role="status"><Check size={15} /> Изменения сохранены</p>}

    {tab === "profile" && <div className="workspacePanels">
      <form className="workspacePanel workspaceForm" onSubmit={saveProfile}><header><UserRound /><div><h2>Личный профиль</h2><p>Используется для откликов, записей и связи.</p></div></header>
        <label>Имя<input required minLength="2" maxLength="100" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
        <label>Компания или организация<input maxLength="120" value={profile.company} onChange={(event) => setProfile({ ...profile, company: event.target.value })} /></label>
        <label>Телефон<input type="tel" maxLength="32" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} placeholder="+7 …" /></label>
        <label>О себе<textarea maxLength="600" rows="3" value={profile.about} onChange={(event) => setProfile({ ...profile, about: event.target.value })} /></label>
        <p className="workspaceFieldNote">{user?.email ? `Аккаунт: ${user.email}` : "Гость. Войдите через TezTap, чтобы синхронизировать профиль между устройствами."}</p><button className="workspacePrimary" type="submit">Сохранить профиль</button>
      </form>
      <form className="workspacePanel workspaceForm" onSubmit={saveLocation}><header><MapPinned /><div><h2>Местоположение</h2><p>Общие город и радиус для поиска по шести разделам.</p></div></header>
        <label>Город<input required maxLength="80" value={location.city || ""} onChange={(event) => setLocationForm({ ...location, city: event.target.value })} /></label>
        <label>Радиус поиска: {location.radiusKm} км<input type="range" min="1" max="25" value={location.radiusKm || 10} onChange={(event) => setLocationForm({ ...location, radiusKm: Number(event.target.value) })} /></label>
        <button type="button" className="workspaceSecondary" onClick={() => { if (!navigator.geolocation) { setFormError("Геолокация недоступна. Выберите точку на карте в любом разделе."); return; } navigator.geolocation.getCurrentPosition(({ coords }) => { setLocationForm((current) => ({ ...current, coordinates: { lat: coords.latitude, lng: coords.longitude }, address: "Моё местоположение" })); setFormError(""); }, (error) => setFormError(error.code === 1 ? "Разрешите геолокацию или выберите точку на карте." : "Не удалось определить местоположение. Попробуйте ещё раз."), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }); }}>Использовать текущее местоположение</button>
        <p className="workspaceFieldNote">Текущая точка: {location.address || "центр города"}. Координаты хранятся только для поиска TezTap.</p><button className="workspacePrimary" type="submit">Сохранить местоположение</button>
      </form>
      <section className="workspacePanel"><header><ShieldCheck /><div><h2>Доступ TezTap</h2><p>{access.role === "ADMIN" ? "Администратор" : `Тариф ${access.plan}`}</p></div></header><p>Используется текущая учётная запись TezTap. Отдельная регистрация для каталога не создаётся.</p></section>
    </div>}

    {tab === "favorites" && <section className="workspacePanel workspaceCollection"><header><Heart /><div><h2>Избранное</h2><p>{workspace.favorites.length} сохранённых карточек из разделов TezTap</p></div></header>{workspace.favorites.length ? <><p className="workspaceFieldNote">Список объединяет места, курсы, вакансии, услуги и объявления на карте.</p><Link className="workspacePrimary" href="/favorites">Открыть избранное</Link></> : <p className="workspaceEmpty">Нажмите на сердечко в карточке любого раздела, чтобы сохранить её.</p>}</section>}
    {tab === "activity" && <div className="workspacePanels"><Collection title="Недавние поиски" icon={Clock3} empty="Ваши поиски появятся здесь." items={workspace.recentSearches.map((item) => ({ ...item, title: item.query, detail: `${item.category || "Все разделы"} · ${formatDate(item.createdAt)}`, href: item.href || `/search?q=${encodeURIComponent(item.query)}` }))} /><Collection title="Записи и заявки" icon={CalendarDaysIcon} empty="Записи и отклики появятся здесь." items={[...workspace.bookings.map((item) => ({ ...item, detail: `Запись · ${item.status || "сохранено локально"}` })), ...workspace.applications.map((item) => ({ ...item, detail: `Отклик · ${item.status || "сохранено локально"}` }))].map((item) => ({ ...item, title: item.title || item.listingTitle, href: item.href || "/profile" }))} /></div>}
    {tab === "messages" && <div className="workspacePanels"><form className="workspacePanel workspaceForm" onSubmit={submitMessage}><header><MessageCircle /><div><h2>Новое сообщение</h2><p>Локальный MVP-чат для контактов из всех разделов.</p></div></header><label>Получатель<input required minLength="2" maxLength="120" value={message.recipient} onChange={(event) => setMessage({ ...message, recipient: event.target.value })} placeholder="Название школы, работодателя или продавца" /></label><label>Раздел<input maxLength="40" value={message.category} onChange={(event) => setMessage({ ...message, category: event.target.value })} placeholder="Образование, работа, места…" /></label><label>Сообщение<textarea required maxLength="1500" rows="4" value={message.text} onChange={(event) => setMessage({ ...message, text: event.target.value })} /></label><p className="workspaceFieldNote">Сообщения сохраняются в профиле, но не отправляются получателю без подключённого канала связи.</p><button className="workspacePrimary" type="submit"><Send size={15} /> Сохранить сообщение</button></form><Collection title="Переписки" icon={MessageCircle} empty="Сохранённых сообщений пока нет." items={workspace.chats.map((item) => ({ ...item, title: item.recipient || item.title || "Контакт", detail: `${item.text} · ${formatDate(item.createdAt)}`, href: "/profile" }))} /></div>}
    {tab === "filters" && <Collection title="Сохранённые фильтры" icon={Bookmark} empty="Сохраните параметры поиска из любого каталога." items={workspace.savedFilters.map((item) => ({ ...item, title: item.label, detail: item.category, onApply: () => { window.sessionStorage.setItem("mercora.workspace.restore-filter.v1", JSON.stringify(item.state || {})); window.location.assign(item.href || "/search"); }, onRemove: () => updateSection("savedFilters", (items) => items.filter((savedFilter) => savedFilter.id !== item.id)) }))} />}
    {tab === "notifications" && <Collection title={`Уведомления${unread ? ` · ${unread} новых` : ""}`} icon={Bell} empty="Здесь появятся статусы ваших записей, откликов и отзывов." items={workspace.notifications.map((item) => ({ ...item, detail: `${item.body || ""} · ${formatDate(item.createdAt)}`, onRead: () => markNotificationRead(item.id), unread: !item.read }))} />}
    {tab === "reviews" && <div className="workspacePanels"><form className="workspacePanel workspaceForm" onSubmit={submitReview}><header><Star /><div><h2>Оставить отзыв</h2><p>Отзыв останется личным черновиком и не изменит публичный рейтинг.</p></div></header><label>Название места или специалиста<input required minLength="2" maxLength="120" value={review.listingTitle} onChange={(event) => setReview({ ...review, listingTitle: event.target.value })} /></label><label>Раздел<select value={review.category} onChange={(event) => setReview({ ...review, category: event.target.value })}><option value="places">Места</option><option value="education">Образование</option><option value="jobs">Работа</option><option value="services">Услуги рядом</option><option value="marketplace">Маркетплейс</option></select></label><label>Оценка<select value={review.rating} onChange={(event) => setReview({ ...review, rating: event.target.value })}>{[5, 4, 3, 2, 1].map((item) => <option key={item} value={item}>{item} из 5</option>)}</select></label><label>Комментарий<textarea required minLength="3" maxLength="2000" rows="4" value={review.text} onChange={(event) => setReview({ ...review, text: event.target.value })} /></label><button className="workspacePrimary" type="submit">Сохранить личный отзыв</button></form><Collection title="Мои отзывы" icon={Star} empty="Пока нет черновиков отзывов." items={workspace.reviews.map((item) => ({ ...item, title: item.listingTitle, detail: `${item.rating}/5 · ${item.text} · ${formatDate(item.createdAt)}` }))} /></div>}
  </PlatformPageShell>;
}

function Collection({ title, icon: Icon, items, empty }) { return <section className="workspacePanel workspaceCollection"><header><Icon /><div><h2>{title}</h2><p>{items.length} записей</p></div></header>{items.length ? <ul>{items.map((item, index) => <li key={item.id || index} className={item.unread ? "unread" : ""}><div><strong>{item.title}</strong>{item.detail && <small>{item.detail}</small>}</div><div className="workspaceRowActions">{item.href && <Link href={item.href}>Открыть</Link>}{item.onApply && <button type="button" onClick={item.onApply}>Применить</button>}{item.onRead && item.unread && <button type="button" onClick={item.onRead}>Прочитано</button>}{item.onRemove && <button type="button" onClick={item.onRemove}>Удалить</button>}</div></li>)}</ul> : <p className="workspaceEmpty">{empty}</p>}</section>; }
function formatDate(value) { return value ? new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : ""; }
function CalendarDaysIcon(props) { return <BriefcaseBusiness {...props} />; }
