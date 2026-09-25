"use client";

import { MapPinned, Store, Target, TrendingUp } from "lucide-react";
import {
  AnalysisEmptyState,
  EvidenceList,
  IntelligenceCard,
  MetricTile,
  PlatformPageShell,
  getAnalysisSummary,
  useLatestAnalysis
} from "../../components/ui/platform-pages";

export default function FranchisePage() {
  const { result } = useLatestAnalysis();
  const summary = getAnalysisSummary(result);
  const franchise = result?.franchiseWorkflow || result?.expansionPlanning || {};

  return (
    <PlatformPageShell
      eyebrow="Franchise Expansion"
      title="Branch placement intelligence"
      subtitle="Compare districts, estimate market potential, assess competition, and identify expansion candidates."
    >
      {!result ? (
        <AnalysisEmptyState title="Franchise module waiting for analysis" />
      ) : (
        <>
          <section className="platformMetricGrid">
            <MetricTile label="Expansion Candidate" value={summary.bestDistrict} detail={summary.bestDistrictDetail} icon={Store} />
            <MetricTile label="Market Potential" value={`${summary.opportunityScore}/100`} detail="Derived from current opportunity score." icon={TrendingUp} />
            <MetricTile label="Competition Risk" value={`${summary.riskScore}/100`} detail="Risk score reflects saturation and competition pressure." icon={Target} />
            <MetricTile label="Districts Compared" value={String(result?.districtMetrics?.length || 0)} detail="District records returned by analytics." icon={MapPinned} />
          </section>
          <section className="platformGrid two">
            <IntelligenceCard title="Expansion shortlist" icon={Store}>
              <EvidenceList items={franchise.newBranchCandidates || result?.districtMetrics || []} />
            </IntelligenceCard>
            <IntelligenceCard title="Competitive monitoring" icon={Target}>
              <EvidenceList items={franchise.competitorMonitoring || result?.competitors || []} empty="No competitor monitoring records were calculated." />
            </IntelligenceCard>
          </section>
        </>
      )}
    </PlatformPageShell>
  );
}
