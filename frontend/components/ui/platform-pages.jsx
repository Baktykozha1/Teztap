"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Bot,
  History,
  LayoutDashboard,
  MapPinned,
  ShieldCheck,
  Sparkles,
  Target,
  LockKeyhole,
  CreditCard,
  Crosshair,
  Home,
  GraduationCap,
  BriefcaseBusiness,
  Wrench,
  Store,
  Building2,
  Heart,
  UserRound,
  TrafficCone
} from "lucide-react";
import { loadLastAnalysis } from "../../lib/analysis-store";
import { useAccess } from "../access-provider";
import { accessCopy } from "../../lib/access-copy";
import policy from "../../../shared/access";
import { compactMoney, formatBusinessType, formatMoney } from "../../lib/formatters";

export const platformRoutes = [
  { href: "/analyze", label: "Analyze", icon: LayoutDashboard },
  { href: "/opportunities", label: "Opportunities", icon: Target },
  { href: "/areas", label: "Best Area", icon: Crosshair },
  { href: "/map", label: "Map", icon: MapPinned },
  { href: "/history", label: "My Business", icon: History },
  { href: "/assistant", label: "AI Consultant", icon: Bot }
];

export const superAppRoutes = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/analyze", label: "\u0411\u0438\u0437\u043d\u0435\u0441", icon: Sparkles },
  { href: "/education", label: "Образование", icon: GraduationCap },
  { href: "/jobs", label: "Работа", icon: BriefcaseBusiness },
  { href: "/services", label: "Услуги рядом", icon: Wrench },
  { href: "/marketplace", label: "Маркетплейс", icon: Store },
  { href: "/places", label: "Места", icon: MapPinned },
  { href: "/traffic", label: "Пробки", icon: TrafficCone },
  { href: "/neighborhood", label: "Мой район", icon: Building2 },
  { href: "/favorites", label: "Избранное", icon: Heart },
  { href: "/profile", label: "Профиль", icon: UserRound }
];

export function PlatformNav() {
  const pathname = usePathname();
  const { can, access, language } = useAccess();
  const t = accessCopy(language);
  const routes = platformRoutes.filter((route) => route.href !== "/analyze").sort((a, b) => Number(can(policy.PAGE_FEATURES[b.href])) - Number(can(policy.PAGE_FEATURES[a.href])));
  if (can("REPORTS")) routes.push({ href: "/reports", label: t.features.REPORTS, icon: BarChart3 });
  if (can("ADMIN_TOOLS")) routes.push({ href: "/admin", label: t.features.ADMIN_TOOLS, icon: ShieldCheck });

  return (
    <div className="superAppNavigation">
      <nav className="superAppNav" aria-label="Super app navigation">
        {superAppRoutes.map((route) => {
          const Icon = route.icon;
          const active = route.href === "/" ? pathname === "/" : pathname === route.href || pathname.startsWith(`${route.href}/`);
          return <Link key={route.href} href={route.href} prefetch={false} className={`superAppNavLink ${active ? "active" : ""}`}><Icon size={16} /><span>{route.label}</span></Link>;
        })}
      </nav>
      <details className="mercoraToolsMenu" open={pathname !== "/" && pathname !== "/welcome" && pathname !== "/education" && pathname !== "/jobs" && pathname !== "/services" && pathname !== "/marketplace" && pathname !== "/places" && !pathname.startsWith("/neighborhood") && pathname !== "/favorites" && pathname !== "/profile"}>
        <summary><BarChart3 size={15} /> Инструменты бизнеса</summary>
        <nav className="platformNav" aria-label="TezTap AI navigation">
      {routes.map((route) => {
        const Icon = route.icon;
        const active = pathname === route.href || pathname.startsWith(`${route.href}/`);
        const feature = policy.PAGE_FEATURES[route.href];
        const locked = !can(feature);

        return (
          <Link key={route.href} href={locked ? `/upgrade?feature=${feature}` : route.href} prefetch={false} className={`platformNavLink ${active ? "active" : ""} ${locked ? "locked" : ""}`}>
            <Icon size={16} />
            <span>{t.features[feature] || route.label}</span>
            {locked && <LockKeyhole size={13} aria-label={`${t.available} ${policy.FEATURE_PLANS[feature]}`} />}
          </Link>
        );
      })}
        </nav>
        <Link href="/upgrade" className="platformNavLink accessPlanLink"><CreditCard size={16} /><span>{access.role === "ADMIN" ? "ADMIN" : access.plan}</span><span>{t.upgrade}</span></Link>
      </details>
    </div>
  );
}

export function useLatestAnalysis() {
  const [stored, setStored] = useState(null);
  const { user, status, access } = useAccess();
  const key = `${user?.id || "guest"}:${access.role}:${access.plan}`;

  useEffect(() => {
    let active = true;
    setStored(null);
    if (status !== "ready") return;
    loadLastAnalysis(user).then((value) => { if (active) setStored(value); });
    return () => { active = false; };
  }, [key, status]);

  return {
    result: stored?.result || null,
    savedAt: stored?.savedAt || null
  };
}

export function PlatformPageShell({ eyebrow = "TezTap Intelligence", title, subtitle, children }) {
  return (
    <main className="appShell">
      <section className="platformPageShell">
        <div className="platformProductBar">
          <Link href="/" className="platformWordmark">TezTap</Link>
          <span>Умная карта Актау</span>
        </div>
        <PlatformNav />
        <header className="platformPageHeader">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}

export function AnalysisEmptyState({ title = "Enter business data to begin analysis", body }) {
  return (
    <section className="platformEmptyState">
      <div className="platformEmptyIcon">
        <Sparkles size={22} />
      </div>
      <div>
        <h2>{title}</h2>
        <p>{body || "Waiting for market analysis. Metrics, charts, recommendations, maps, and reports stay inactive until the analytics engine calculates real results."}</p>
      </div>
      <div className="platformEmptySkeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

export function MetricTile({ label, value = "—", detail = "Waiting for analysis", icon: Icon = BarChart3 }) {
  return (
    <article className="platformMetricTile">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <Icon size={20} />
      <p>{detail}</p>
    </article>
  );
}

export function IntelligenceCard({ title, children, icon: Icon = ShieldCheck }) {
  return (
    <article className="platformCard">
      <div className="platformCardHeader">
        <Icon size={18} />
        <h2>{title}</h2>
      </div>
      {children}
    </article>
  );
}

export function EvidenceList({ items = [], empty = "No evidence calculated yet." }) {
  if (!items.length) {
    return <p className="platformMuted">{empty}</p>;
  }

  return (
    <div className="platformEvidenceList">
      {items.slice(0, 6).map((item, index) => (
        <div key={`${String(item.label || item.title || item.district || item.category || index)}-${index}`}>
          <strong>{item.label || item.title || item.district || item.category || `Signal ${index + 1}`}</strong>
          <span>{item.evidence || item.reason || item.description || item.detail || item.recommendation || item.risk || item.signal || "Calculated by analytics engine."}</span>
        </div>
      ))}
    </div>
  );
}

export function getAnalysisSummary(result) {
  const scores = result?.proprietaryScoring?.scores || result?.scoring || {};
  const bestDistrict = result?.districtMetrics?.[0] || result?.recommendedDistricts?.[0] || {};
  const input = result?.input || {};

  return {
    city: input.city || result?.city || "Selected city",
    businessType: formatBusinessType(input.businessType || result?.businessType || ""),
    budget: input.budget ? `${formatMoney(input.budget)} KZT` : "Budget not provided",
    successProbability: scoreValue(scores.successProbability ?? result?.probability?.successProbability ?? result?.successProbability),
    opportunityScore: scoreValue(scores.opportunityScore ?? result?.opportunityScore?.score ?? result?.analytics?.opportunityScore),
    riskScore: scoreValue(scores.riskScore ?? result?.analyticsEngine?.riskAnalysis?.riskScore ?? result?.riskAnalysis?.riskScore ?? result?.riskScore),
    investmentAttractiveness: scoreValue(scores.investmentAttractiveness ?? result?.investmentModule?.thesis?.investmentAttractiveness ?? result?.ecosystemWorkflows?.workflows?.investors?.investmentOpportunityDiscovery?.investmentAttractiveness),
    bestDistrict: bestDistrict.district || bestDistrict.name || "No district ranked yet",
    bestDistrictDetail: districtDetail(bestDistrict)
  };
}

export function scoreValue(value) {
  if (value && typeof value === "object") {
    return scoreValue(value.score ?? value.value ?? value.current ?? value.index);
  }

  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }
  return String(Math.round(numeric));
}

export function moneyOrEmpty(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? `${compactMoney(numeric)} KZT` : "Not calculated";
}

function districtDetail(district) {
  const parts = [];
  if (district.opportunityScore !== undefined) parts.push(`opportunity ${Math.round(Number(district.opportunityScore) || 0)}/100`);
  if (district.competitionDensity !== undefined) parts.push(`density ${Number(district.competitionDensity).toFixed(2)}`);
  if (district.saturationLevel) parts.push(`${district.saturationLevel} saturation`);
  return parts.length ? parts.join(" · ") : "Waiting for district analytics";
}
