"use client";

import { Activity, BarChart3, Building2, Landmark } from "lucide-react";
import {
  AnalysisEmptyState,
  EvidenceList,
  IntelligenceCard,
  MetricTile,
  PlatformPageShell,
  getAnalysisSummary,
  scoreValue,
  useLatestAnalysis
} from "../../components/ui/platform-pages";

export default function EconomicPage() {
  const { result } = useLatestAnalysis();
  const summary = getAnalysisSummary(result);
  const indicator = result?.cityEconomicIndicator || result?.economicIndicator || {};

  return (
    <PlatformPageShell
      eyebrow="City Economy"
      title="City-wide economic indicator"
      subtitle="Measure business activity, competition density, investment attractiveness, entrepreneurship growth, and market diversity."
    >
      {!result ? (
        <AnalysisEmptyState title="City economy indicator waiting for analysis" />
      ) : (
        <>
          <section className="platformMetricGrid">
            <MetricTile label="Business Activity" value={scoreValue(indicator.businessActivity ?? summary.opportunityScore)} detail="Current city activity signal." icon={Activity} />
            <MetricTile label="Competition Density" value={scoreValue(indicator.competitionDensity ?? result?.market?.competitorCount)} detail="Competitor pressure from current market evidence." icon={BarChart3} />
            <MetricTile label="Investment Appeal" value={`${summary.investmentAttractiveness}/100`} detail="Investor-facing city attractiveness." icon={Landmark} />
            <MetricTile label="Market Diversity" value={scoreValue(indicator.marketDiversity)} detail="0 until diversity data is calculated." icon={Building2} />
          </section>
          <section className="platformGrid two">
            <IntelligenceCard title="Trend evidence" icon={Activity}>
              <EvidenceList items={indicator.trends || result?.cityIndicators || []} empty="No historical trend data exists yet. Run and save analyses over time." />
            </IntelligenceCard>
            <IntelligenceCard title="District contribution" icon={BarChart3}>
              <EvidenceList items={result?.districtMetrics || []} empty="No district contribution data was returned." />
            </IntelligenceCard>
          </section>
        </>
      )}
    </PlatformPageShell>
  );
}
