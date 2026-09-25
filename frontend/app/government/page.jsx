"use client";

import { Building2, Landmark, ShieldCheck, TrendingUp } from "lucide-react";
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

export default function GovernmentPage() {
  const { result } = useLatestAnalysis();
  const summary = getAnalysisSummary(result);
  const indicators = result?.cityEconomicIndicator || result?.economicIndicator || {};

  return (
    <PlatformPageShell
      eyebrow="Public Sector Intelligence"
      title="Economic development dashboard"
      subtitle="Support district development, entrepreneurship growth, market diversity, and business activity decisions."
    >
      {!result ? (
        <AnalysisEmptyState title="Government intelligence waiting for analysis" />
      ) : (
        <>
          <section className="platformMetricGrid">
            <MetricTile label="Business Activity" value={scoreValue(indicators.businessActivity ?? summary.opportunityScore)} detail="City-wide activity indicator from available analytics." icon={Building2} />
            <MetricTile label="Investment Appeal" value={`${summary.investmentAttractiveness}/100`} detail="District attractiveness for economic development." icon={Landmark} />
            <MetricTile label="Market Diversity" value={scoreValue(indicators.marketDiversity)} detail="0 until city indicator evidence is available." icon={TrendingUp} />
            <MetricTile label="Risk Level" value={`${summary.riskScore}/100`} detail="Market risk for policy and support planning." icon={ShieldCheck} />
          </section>
          <section className="platformGrid two">
            <IntelligenceCard title="Development opportunities" icon={Building2}>
              <EvidenceList items={result?.opportunityDiscovery?.districtOpportunityDetection || result?.districtMetrics || []} />
            </IntelligenceCard>
            <IntelligenceCard title="Market constraints" icon={ShieldCheck}>
              <EvidenceList items={result?.analyticsEngine?.riskAnalysis?.risks || result?.riskAnalysis?.risks || []} empty="No market constraints were calculated." />
            </IntelligenceCard>
          </section>
        </>
      )}
    </PlatformPageShell>
  );
}
