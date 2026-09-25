"use client";

import { useState } from "react";
import { ArrowRight, Check, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useAccess } from "../../components/access-provider";
import { PlatformPageShell } from "../../components/ui/platform-pages";
import { accessCopy } from "../../lib/access-copy";

const groups = {
  BASIC: ["BASIC_ANALYSIS", "SMART_MAP"],
  PRO: ["OPPORTUNITY_SCORE", "ADVANCED_COMPETITION", "DEMOGRAPHICS", "MARKET_GAP", "AI_ADVISOR", "LOCATION_COMPARISON", "OPPORTUNITY_SCANNER", "PRICING", "BEST_DISTRICT_FINDER"],
  BUSINESS: ["DYNAMIC_MARKET", "PLANNED_BUSINESS", "FUTURE_MARKET_PRESSURE", "FORECASTING", "REPORTS", "EXPORT", "MULTIPLE_PROJECTS", "COMMERCIAL_PROPERTIES"],
  ENTERPRISE: ["EXPANSION", "ENTERPRISE_TOOLS"]
};

export default function UpgradePage() {
  const { user, access, language, setLanguage, status } = useAccess();
  const t = accessCopy(language);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function requestPlan(plan) {
    setBusy(plan); setError(""); setNotice("");
    try {
      const response = await fetch("/api/subscription-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
      if (!response.ok) throw new Error(t.error);
      setNotice(t.sent);
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  return (
    <PlatformPageShell title={t.title} subtitle={t.intro} eyebrow={t.upgrade}>
      <div className="accessToolbar">
        <strong>{access.role === "ADMIN" ? t.admin : `${t.current}: ${access.plan}`}</strong>
        <div className="segmentedControl">{["kk", "ru", "en"].map((lang) => <button key={lang} className={lang === language ? "active" : ""} onClick={() => { setLanguage(lang); document.documentElement.lang = lang; }}>{lang === "kk" ? "QAZ" : lang.toUpperCase()}</button>)}</div>
      </div>
      <div className="accessPlanGrid">
        {Object.entries(groups).map(([plan, features], index) => {
          const current = access.plan === plan;
          return <article className={`accessPlan ${current ? "current" : ""}`} key={plan}>
            <div className="accessPlanHeading"><h2>{plan}</h2>{current && <CheckCircle2 size={20} aria-label={t.current} />}</div>
            <p>{plan === "BASIC" ? t.free : t.contact}</p>
            {index > 0 && <strong className="accessPrevious">{t.allPrevious} {Object.keys(groups)[index - 1]}</strong>}
            <ul>{features.map((feature) => <li key={feature}><Check size={15} /><span>{t.features[feature]}</span></li>)}</ul>
            {access.role === "ADMIN" || current ? <span className="accessCurrent">{t.included}</span> : !user ? <Link className="secondaryButton" href="/analyze#account">{t.signIn}<ArrowRight size={15} /></Link> : plan !== "BASIC" ? <button className="primaryButton" disabled={Boolean(busy) || status !== "ready"} onClick={() => requestPlan(plan)}>{busy === plan ? t.pending : t.request}<ArrowRight size={15} /></button> : <Link href="/analyze" className="secondaryButton">{t.features.BASIC_ANALYSIS}</Link>}
          </article>;
        })}
      </div>
      <p className="sourceText">{t.billing}</p>
      <p className="sourceText"><strong>{t.future}: </strong>{t.futureNote}</p>
      {notice && <p role="status" className="statusNote">{notice}</p>}
      {error && <p role="alert" className="errorText">{error}</p>}
    </PlatformPageShell>
  );
}
