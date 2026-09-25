"use client";

import { BadgeCheck, PiggyBank, ShieldAlert, TrendingUp } from "lucide-react";
import {
  AnalysisEmptyState,
  EvidenceList,
  IntelligenceCard,
  MetricTile,
  PlatformPageShell,
  getAnalysisSummary,
  useLatestAnalysis
} from "../../components/ui/platform-pages";

export default function BanksPage() {
  const { result } = useLatestAnalysis();
  const summary = getAnalysisSummary(result);
  const risks = result?.analyticsEngine?.riskAnalysis?.risks || result?.riskAnalysis?.risks || [];
  const forecasts = result?.financialForecasts || result?.financialForecast || {};

  return (
    <PlatformPageShell
      eyebrow="Bank Risk Intelligence"
      title="Business loan viability assessment"
      subtitle="Assess market viability, district conditions, budget realism, and repayment risk with evidence from the analytics engine."
    >
      {!result ? (
        <AnalysisEmptyState title="Loan risk module waiting for analysis" />
      ) : (
        <>
          <section className="platformMetricGrid">
            <MetricTile label="Viability" value={`${summary.successProbability}%`} detail="Success probability from current scoring output." icon={BadgeCheck} />
            <MetricTile label="Market Risk" value={`${summary.riskScore}/100`} detail="Risk score calculated from saturation, budget, and competition." icon={ShieldAlert} />
            <MetricTile label="Attractiveness" value={`${summary.investmentAttractiveness}/100`} detail="Investment attractiveness score." icon={PiggyBank} />
            <MetricTile label="Forecast Status" value={forecasts.status || "Calculated"} detail="Financial forecast evidence from latest analysis." icon={TrendingUp} />
          </section>
          <section className="platformGrid two">
            <IntelligenceCard title="Credit risk evidence" icon={ShieldAlert}>
              <EvidenceList items={risks} empty="No credit risk evidence was calculated." />
            </IntelligenceCard>
            <IntelligenceCard title="Viability drivers" icon={PiggyBank}>
              <EvidenceList items={result?.districtMetrics || []} empty="No district viability evidence was returned." />
            </IntelligenceCard>
          </section>
        </>
      )}
    </PlatformPageShell>
  );
}
