"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, LockKeyhole, RefreshCw } from "lucide-react";
import policy from "../../shared/access";
import { accessCopy } from "../lib/access-copy";

const AccessContext = createContext(null);
export function AccessProvider({ children }) {
  const [user, setUser] = useState(null);
  const [demoSubscription, setDemoSubscription] = useState(false);
  const [status, setStatus] = useState("loading");
  const [language, setLanguage] = useState("ru");
  const pathname = usePathname();
  const router = useRouter();
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++revision.current;
    try {
      const response = await fetch("/api/access", { cache: "no-store" });
      if (!response.ok) throw new Error("Access unavailable");
      const data = await response.json();
      if (version === revision.current) { setUser(data.user || null); setDemoSubscription(data.demoSubscription === true); setStatus("ready"); }
      return data.user;
    } catch {
      if (version === revision.current) { setUser(null); setDemoSubscription(false); setStatus("error"); }
      return null;
    }
  }, []);
  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const old = JSON.parse(localStorage.getItem("venturescope-session") || "null");
        if (old?.token) await fetch("/api/auth/session", { method: "POST", headers: { Authorization: `Bearer ${old.token}` } });
        localStorage.removeItem("venturescope-session");
      } catch { localStorage.removeItem("venturescope-session"); }
      if (active) await refresh();
    }
    initialize();
    const observer = new MutationObserver(() => setLanguage(document.documentElement.lang || "ru"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    setLanguage(document.documentElement.lang || "ru");
    const focus = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", focus);
    const interval = setInterval(focus, 60000);
    return () => { active = false; observer.disconnect(); window.removeEventListener("focus", focus); clearInterval(interval); };
  }, [refresh]);
  useEffect(() => { refresh(); }, [pathname, refresh]);
  const access = policy.getAccess(user);
  const can = (feature) => status === "ready" && (
    (demoSubscription && policy.PLAN_FEATURES.ENTERPRISE.includes(feature)) ||
    policy.canAccessFeature(user, feature)
  );
  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error("Sign out failed");
    localStorage.removeItem("mercora:last-analysis");
    await refresh();
    router.refresh();
  }
  const feature = policy.PAGE_FEATURES[pathname];
  const restricted = feature && !["BASIC_ANALYSIS", "SMART_MAP"].includes(feature);
  return (
    <AccessContext.Provider value={{ user, session: user ? { user } : null, access, demoSubscription, status, can, refresh, logout, language, setLanguage }}>
      {restricted && !can(feature) ? <div className="appShell"><AccessGate feature={feature} /></div> : children}
    </AccessContext.Provider>
  );
}

export function useAccess() {
  return useContext(AccessContext);
}

export function AccessGate({ feature, children, compact = false }) {
  const { can, status, refresh, language } = useAccess();
  const t = accessCopy(language);
  if (can(feature)) return children || null;
  if (status !== "ready") return <section className="accessNotice" role="status"><p>{status === "loading" ? t.loading : t.error}</p>{status === "error" && <button className="secondaryButton" onClick={refresh}><RefreshCw size={16} />{t.retry}</button>}</section>;
  const plan = policy.FEATURE_PLANS[feature] || "ADMIN";
  return (
    <section className={`accessPaywall ${compact ? "compact" : ""}`}>
      <LockKeyhole size={22} aria-hidden="true" />
      <div><span className="eyebrow">{plan === "ADMIN" ? t.restricted : `${t.available} ${plan}`}</span><h2>{t.features[feature] || t.restricted}</h2><p>{plan === "ADMIN" ? t.adminOnly : t.noResults}</p></div>
      <Link className="primaryButton" href={plan === "ADMIN" ? "/analyze" : `/upgrade?feature=${feature}`}>{plan === "ADMIN" ? t.features.BASIC_ANALYSIS : t.upgrade}<ArrowRight size={16} /></Link>
    </section>
  );
}
