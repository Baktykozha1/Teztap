"use client";

import { CalendarClock, History, Target } from "lucide-react";
import {
  AnalysisEmptyState,
  EvidenceList,
  IntelligenceCard,
  MetricTile,
  PlatformPageShell,
  getAnalysisSummary,
  useLatestAnalysis
} from "../../components/ui/platform-pages";

export default function HistoryPage() {
  const { result, savedAt } = useLatestAnalysis();
  const summary = getAnalysisSummary(result);

  return (
    <PlatformPageShell
      eyebrow="Analysis History"
      title="Saved market intelligence"
      subtitle="Review the most recent calculated analysis and the evidence used across TezTap pages."
    >
      {!result ? (
        <AnalysisEmptyState title="No saved analysis yet" body="Run a city, category, and budget analysis from the dashboard. This page will then restore the latest real analytics result across the platform." />
      ) : (
        <>
          <section className="platformMetricGrid">
            <MetricTile label="Latest City" value={summary.city} detail={summary.businessType} icon={History} />
            <MetricTile label="Saved At" value={savedAt ? new Date(savedAt).toLocaleString() : "Active session"} detail="Local analysis snapshot." icon={CalendarClock} />
            <MetricTile label="Opportunity" value={`${summary.opportunityScore}/100`} detail={summary.bestDistrictDetail} icon={Target} />
          </section>

          <section className="platformGrid two">
            <IntelligenceCard title="Latest analysis summary" icon={History}>
              <p className="platformLead">
                <strong>{summary.businessType}</strong> in <strong>{summary.city}</strong> with budget <strong>{summary.budget}</strong>.
              </p>
              <EvidenceList items={result?.districtMetrics || []} empty="No district history evidence was returned." />
            </IntelligenceCard>
            <IntelligenceCard title="Calculated recommendations" icon={Target}>
              <EvidenceList items={result?.recommendations || result?.aiRecommendations || result?.marketGapEngine?.opportunities || []} empty="No recommendations were stored in the latest result." />
            </IntelligenceCard>
          </section>
        </>
      )}
    </PlatformPageShell>
  );
}
