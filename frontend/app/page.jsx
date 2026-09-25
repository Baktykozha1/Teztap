"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, BriefcaseBusiness, Building2, GraduationCap, Heart, Home, Map, MapPin, MapPinned, Search, Sparkles, Store, UserRound, Wrench, X } from "lucide-react";
import { useWorkspace } from "../components/workspace-provider";

const features = [
  { key: "mercora", title: "\u0411\u0438\u0437\u043d\u0435\u0441", description: "Умная карта и ИИ-анализ, который помогает сравнить варианты и принять решение.", href: "/analyze", icon: Sparkles, className: "home-feature-mercora", tag: "ИИ-КАРТА TEZTAP" },
  { key: "education", title: "Образование", description: "Репетиторы, курсы, языки и подготовка к экзаменам.", href: "/education", icon: GraduationCap },
  { key: "jobs", title: "Работа", description: "Вакансии, подработка, стажировки и резюме.", href: "/jobs", icon: BriefcaseBusiness },
  { key: "services", title: "Услуги рядом", description: "Мастера, няни, уборка и специалисты красоты.", href: "/services", icon: Wrench },
  { key: "marketplace", title: "Маркетплейс", description: "Покупайте, продавайте и арендуйте в Актау.", href: "/marketplace", icon: Store },
  { key: "places", title: "Места", description: "Кафе, клиники, спорт и досуг на карте.", href: "/places", icon: MapPinned },
  { key: "neighborhood", title: "Мой район", description: "Новости дома, события и обсуждения соседей на карте.", href: "/neighborhood", icon: Building2 }
];

export default function HomePage() {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { workspace, markNotificationRead } = useWorkspace();
  const unreadNotifications = workspace.notifications.filter((item) => !item.read).length;

  return (
    <main className="consumerHome">
      <div className="consumerHomeShell">
        <header className="consumerHeader">
          <Link className="consumerBrand" href="/" aria-label="TezTap — главная">
            <span className="consumerBrandMark"><MapPinned size={20} strokeWidth={2.3} /></span>
            <span>TezTap<span className="brandPeriod">.</span></span>
          </Link>
          <div className="consumerLocation"><MapPin size={16} fill="currentColor" /><span>Aktau</span><span className="locationChevron">⌄</span></div>
          <div className="consumerHeaderActions">
            <div className="notificationWrap">
              <button className={`headerIconButton ${notificationsOpen ? "selected" : ""}`} type="button" aria-label="Уведомления" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((value) => !value)}>
                <Bell size={19} />{unreadNotifications > 0 && <span className="notificationCount">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}
              </button>
              {notificationsOpen && <div className="notificationPopover" role="dialog" aria-label="Уведомления"><div><strong>Уведомления</strong><button type="button" aria-label="Закрыть уведомления" onClick={() => setNotificationsOpen(false)}><X size={16} /></button></div>{workspace.notifications.length ? workspace.notifications.slice(0, 6).map((item) => <Link className={`homeNotification ${item.read ? "" : "unread"}`} key={item.id} href={item.href || "/profile"} onClick={() => markNotificationRead(item.id)}><strong>{item.title}</strong><span>{item.body || "Новое событие TezTap"}</span></Link>) : <p>Пока уведомлений нет. Статусы записей и откликов появятся здесь.</p>}<Link className="allNotificationsLink" href="/profile">Все уведомления</Link></div>}
            </div>
            <Link className="headerIconButton" href="/favorites" aria-label="Избранное"><Heart size={19} /></Link>
            <Link className="profileAvatar" href="/profile" aria-label="Профиль"><UserRound size={18} /></Link>
          </div>
        </header>

        <section className="consumerWelcome" aria-labelledby="home-title">
          <div className="welcomeLocationPill"><span /> РЯДОМ С ВАМИ · AKTAU</div>
          <h1 id="home-title">TezTap — всё нужное в Актау, рядом и на одной карте</h1>
          <p>Находите места, образование, работу, услуги и объявления. TezTap AI сравнит подходящие варианты по расстоянию, рейтингу и другим важным факторам.</p>
        </section>

        <section className="projectEssence" aria-label="Как работает TezTap">
          <span className="projectEssenceLabel">КАК ЭТО РАБОТАЕТ</span>
          <div><strong>Опишите, что ищете</strong><span>Поиск по городу обычными словами</span></div>
          <span className="projectEssenceArrow" aria-hidden="true">→</span>
          <div><strong>Сравните варианты</strong><span>TezTap AI учитывает ваши условия</span></div>
          <span className="projectEssenceArrow" aria-hidden="true">→</span>
          <div><strong>Выберите рядом</strong><span>Список и карта работают вместе</span></div>
        </section>

        <form className="globalSearch" action="/search" method="get" role="search">
          <Search size={20} aria-hidden="true" />
          <label className="consumerSrOnly" htmlFor="teztap-global-search">Поиск по TezTap</label>
          <input id="teztap-global-search" name="q" type="search" placeholder="Найдите место, услугу, курс или работу" />
          <button type="submit" aria-label="Искать"><Search size={18} /><span>Найти</span></button>
        </form>

        <section className="mainFeatures" aria-labelledby="features-heading">
          <div className="mainFeaturesHeading"><div><span>ОТКРОЙТЕ ДЛЯ СЕБЯ</span><h2 id="features-heading">Что вам нужно сегодня?</h2></div><span className="featureCount">07 функций</span></div>
          <div className="consumerFeatureGrid">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Link className={`consumerFeatureCard ${feature.className || ""}`} href={feature.href} data-main-feature={feature.key} key={feature.key}>
                  <span className="consumerFeatureIcon"><Icon size={22} strokeWidth={1.9} /></span>
                  <span className="consumerFeatureArrow" aria-hidden="true">↗</span>
                  {feature.tag && <span className="consumerFeatureTag">{feature.tag}</span>}
                  <div className="consumerFeatureCopy"><span className="consumerFeatureIndex">0{index + 1}</span><h3>{feature.title}</h3><p>{feature.description}</p><span className="consumerFeatureAction">Открыть <span aria-hidden="true">→</span></span></div>
                  {feature.key === "mercora" && <span className="mercoraHomeOrb" aria-hidden="true"><i /><i /><i /></span>}
                </Link>
              );
            })}
          </div>
        </section>

        <footer className="consumerFooter"><span>TezTap <i>·</i> Актау</span><span>Город ближе, когда всё рядом</span></footer>
      </div>

      <nav className="consumerBottomNav" aria-label="Нижняя навигация">
        <Link className="bottomNavItem active" href="/"><Home size={19} /><span>Главная</span></Link>
        <Link className="bottomNavItem" href="/analyze"><Sparkles size={19} /><span>TezTap AI</span></Link>
        <Link className="bottomNavItem" href="/map"><Map size={19} /><span>Карта</span></Link>
        <Link className="bottomNavItem" href="/favorites"><Heart size={19} /><span>Избранное</span></Link>
        <Link className="bottomNavItem" href="/profile"><UserRound size={19} /><span>Профиль</span></Link>
      </nav>
      <Link className="askTezTapButton" href="/analyze?mercoraPrompt=Помоги%20найти%20подходящий%20вариант%20рядом%20в%20Актау#mercora-ai"><span className="askTezTapIcon"><Sparkles size={18} /></span><span>Спросить TezTap AI</span><span className="askTezTapArrow">↗</span></Link>
    </main>
  );
}
