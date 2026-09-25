"use client";

import { BadgeCheck, Search, Target, TrendingUp } from "lucide-react";
import {
  AnalysisEmptyState,
  EvidenceList,
  IntelligenceCard,
  MetricTile,
  PlatformPageShell,
  getAnalysisSummary,
  useLatestAnalysis
} from "../../components/ui/platform-pages";

export default function OpportunitiesPage() {
  const { result } = useLatestAnalysis();
  const summary = getAnalysisSummary(result);
  const discovery = result?.opportunityDiscovery || {};
  const gaps = discovery.marketGaps || result?.marketGapEngine?.signals || result?.marketGapEngine?.opportunities || [];
  const underserved = discovery.underservedCategories || discovery.districtOpportunityDetection || [];

  return (
    <PlatformPageShell
      eyebrow="Opportunity Discovery"
      title="Market gaps and missing services"
      subtitle="Detect underserved categories, weak competition zones, pricing gaps, and realistic business opportunities from calculated analytics."
    >
      {!result ? (
        <AnalysisEmptyState title="Opportunity engine waiting for analysis" />
      ) : (
        <>
          <section className="platformMetricGrid">
            <MetricTile label="Opportunity Score" value={`${summary.opportunityScore}/100`} detail={summary.bestDistrictDetail} icon={Target} />
            <MetricTile label="Best District" value={summary.bestDistrict} detail="Highest ranked district from current analytics." icon={Search} />
            <MetricTile label="Success Probability" value={`${summary.successProbability}%`} detail="Calculated only after city, category, budget, and analysis request." icon={BadgeCheck} />
            <MetricTile label="Growth Potential" value={`${summary.investmentAttractiveness}/100`} detail="Risk-adjusted attractiveness proxy." icon={TrendingUp} />
          </section>
          <section className="platformGrid two">
            <IntelligenceCard title="Underserved categories" icon={Target}>
              <EvidenceList items={underserved} empty="No underserved categories were calculated." />
            </IntelligenceCard>
            <IntelligenceCard title="Market gap evidence" icon={Search}>
              <EvidenceList items={gaps} empty="No market gaps were returned by the analytics engine." />
            </IntelligenceCard>
          </section>
        </>
      )}
    </PlatformPageShell>
  );
}
