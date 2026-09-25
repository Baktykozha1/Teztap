"use client";

import dynamic from "next/dynamic";
import { MapPinned, Navigation, Target } from "lucide-react";
import { useAccess } from "../../components/access-provider";
import { BasicAnalysis } from "../../components/basic-analysis";
import {
  AnalysisEmptyState,
  EvidenceList,
  IntelligenceCard,
  MetricTile,
  PlatformPageShell,
  getAnalysisSummary,
  useLatestAnalysis
} from "../../components/ui/platform-pages";

const CompetitorLeafletMap = dynamic(() => import("../components/CompetitorLeafletMap"), {
  ssr: false,
  loading: () => <div className="mapLoading">Loading interactive map...</div>
});

export default function MapIntelligencePage() {
  const { result } = useLatestAnalysis();
  const { can } = useAccess();
  const summary = getAnalysisSummary(result);
  const competitors = result?.competitors || result?.visibleCompetitors || [];

  return (
    <PlatformPageShell
      eyebrow="Geo Intelligence"
      title="Map and district analytics"
      subtitle="Competitor visualization, district rankings, heatmap intelligence, and location opportunity evidence."
    >
      {!result ? (
        <AnalysisEmptyState title="Map waiting for calculated market data" />
      ) : !can("OPPORTUNITY_SCORE") ? <BasicAnalysis result={result} /> : (
        <>
          <section className="platformMetricGrid">
            <MetricTile label="Best District" value={summary.bestDistrict} detail={summary.bestDistrictDetail} icon={MapPinned} />
            <MetricTile label="Competitors" value={String(competitors.length || 0)} detail="Visible competitor records from the latest analysis." icon={Navigation} />
            <MetricTile label="Opportunity" value={`${summary.opportunityScore}/100`} detail="Calculated from district, demand, pricing, and competition signals." icon={Target} />
          </section>

          <section className="platformGrid">
            <IntelligenceCard title="Interactive market map" icon={MapPinned}>
              <CompetitorLeafletMap result={result} />
            </IntelligenceCard>
          </section>

          <section className="platformGrid two">
            <IntelligenceCard title="District rankings" icon={Target}>
              <EvidenceList items={result?.districtMetrics || []} empty="No district rankings were returned." />
            </IntelligenceCard>
            <IntelligenceCard title="Heatmap signals" icon={Navigation}>
              <EvidenceList items={result?.heatmapData || result?.heatmap || []} empty="No heatmap signals were returned." />
            </IntelligenceCard>
          </section>
        </>
      )}
    </PlatformPageShell>
  );
}
