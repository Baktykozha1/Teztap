"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Inbox } from "lucide-react";
import { ResponsiveContainer } from "recharts";
import { AccessGate, useAccess } from "../access-provider";

const sectionTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] };

export function DashboardSection({ icon: Icon, title, narrative, children, className = "", busy = false, feature }) {
  const { can } = useAccess();
  if (feature && !can(feature)) return <AccessGate compact feature={feature} />;
  return (
    <motion.article
      layout
      className={`glassPanel dashboardSection ${className}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={sectionTransition}
      aria-busy={busy || undefined}
    >
      <div className="panelHeader compact">
        <div>
          <span className="eyebrow"><Icon size={14} /> Calculated from data</span>
          <h2>{title}</h2>
        </div>
      </div>
      {narrative ? (
        <motion.p className="aiNarrative" key={narrative} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={sectionTransition}>
          {narrative}
        </motion.p>
      ) : null}
      {children}
    </motion.article>
  );
}

export function Kpi({ label, value }) {
  return (
    <article className="kpi">
      <span>{label}</span>
      <strong>{value || value === 0 ? value : "Unavailable"}</strong>
    </article>
  );
}

export function FactorBar({ label, value }) {
  const isMissing = value === null || value === undefined || value === "";
  const numericValue = Number(value);
  const hasValue = !isMissing && Number.isFinite(numericValue);
  const safeValue = hasValue ? Math.max(0, Math.min(100, Math.round(numericValue))) : 0;

  return (
    <div className="factorRow" aria-label={`${label}: ${hasValue ? safeValue : "not available"}`}>
      <span>{label}</span>
      <div className="factorTrack"><i style={{ width: `${safeValue}%` }} /></div>
      <strong>{hasValue ? safeValue : "n/a"}</strong>
    </div>
  );
}

export function ChartCard({ title, subtitle = "", children, isEmpty = false, emptyText = "No chart data is available for the current analysis." }) {
  return (
    <article className="chartCard">
      <strong>{title}</strong>
      {subtitle ? <small>{subtitle}</small> : null}
      <div className="chartFrame">
        {isEmpty ? (
          <EmptyState title="No chart data" body={emptyText} className="chartEmptyState" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </article>
  );
}

export function Toolbar({ icon: Icon, value, onChange, placeholder, count, totalCount = count }) {
  const rowLabel = totalCount === count ? `${count} rows` : `${count}/${totalCount} rows`;

  return (
    <div className="toolbar">
      <Icon size={17} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      <span>{rowLabel}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, body, action = null, className = "" }) {
  return (
    <div className={`statePanel emptyPanel ${className}`} role="status">
      <Icon size={20} />
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ title, body, onRetry, className = "" }) {
  return (
    <div className={`statePanel errorPanel ${className}`} role="alert">
      <AlertTriangle size={20} />
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {onRetry ? (
        <button type="button" className="secondaryButton" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <motion.section
      className="dashboardGrid dashboardSkeleton"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={sectionTransition}
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="ventureConsole skeletonPanel wideSkeleton">
        <div className="skeletonStack">
          <span className="skeletonLine short" />
          <span className="skeletonLine title" />
          <span className="skeletonLine medium" />
        </div>
        <div className="capabilityGrid">
          {Array.from({ length: 6 }).map((_, index) => (
            <article className="skeletonCell" key={`capability-skeleton-${index}`}>
              <span className="skeletonToken iconToken" />
              <span className="skeletonLine short" />
              <span className="skeletonLine medium" />
            </article>
          ))}
        </div>
        <div className="skeletonStack">
          <span className="skeletonLine short" />
          <span className="skeletonLine title" />
          <span className="skeletonLine medium" />
        </div>
      </div>

      <SkeletonSection className="wideSection" rows={6} />
      <SkeletonSection rows={5} />
      <SkeletonSection rows={5} />
      <SkeletonSection className="wideSection" rows={7} />
    </motion.section>
  );
}

function SkeletonSection({ className = "", rows = 4 }) {
  return (
    <article className={`glassPanel dashboardSection skeletonPanel ${className}`} aria-hidden="true">
      <div className="panelHeader compact">
        <div className="skeletonStack">
          <span className="skeletonLine short" />
          <span className="skeletonLine title" />
        </div>
      </div>
      <span className="skeletonLine full" />
      <span className="skeletonLine long" />
      <div className="skeletonGrid">
        {Array.from({ length: rows }).map((_, index) => (
          <span className="skeletonBlock" key={`section-skeleton-${index}`} />
        ))}
      </div>
    </article>
  );
}
