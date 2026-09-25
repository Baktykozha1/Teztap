"use client";

import { Landmark, LineChart, ShieldCheck, TrendingUp } from "lucide-react";
import {
  AnalysisEmptyState,
  EvidenceList,
  IntelligenceCard,
  MetricTile,
  PlatformPageShell,
  getAnalysisSummary,
  moneyOrEmpty,
  useLatestAnalysis
} from "../../components/ui/platform-pages";

export default function InvestorsPage() {
  const { result } = useLatestAnalysis();
  const summary = getAnalysisSummary(result);
  const forecasts = result?.financialForecasts || result?.financialForecast || {};
  const investor = result?.investmentModule || result?.investorDecision || {};
  const risks = result?.analyticsEngine?.riskAnalysis?.risks || result?.riskAnalysis?.risks || [];

  return (
    <PlatformPageShell
      eyebrow="Investment Intelligence"
      title="Investor opportunity console"
      subtitle="Evaluate districts, sectors, risk-adjusted attractiveness, and business viability from the latest analytics run."
    >
      {!result ? (
        <AnalysisEmptyState title="Investor console waiting for analysis" />
      ) : (
        <>
          <section className="platformMetricGrid">
            <MetricTile label="Investment Appeal" value={`${summary.investmentAttractiveness}/100`} detail={summary.bestDistrictDetail} icon={Landmark} />
            <MetricTile label="Growth Potential" value={`${summary.opportunityScore}/100`} detail="Opportunity score used as current growth proxy." icon={TrendingUp} />
            <MetricTile label="Risk Score" value={`${summary.riskScore}/100`} detail="Risk-adjusted view from scoring engine." icon={ShieldCheck} />
            <MetricTile label="Estimated Capital" value={moneyOrEmpty(forecasts.requiredCapital || investor.requiredCapital)} detail={`Submitted budget: ${summary.budget}`} icon={LineChart} />
          </section>

          <section className="platformGrid two">
            <IntelligenceCard title="Investment thesis" icon={Landmark}>
              <p className="platformLead">
                The latest analysis evaluates <strong>{summary.businessType}</strong> in <strong>{summary.city}</strong> using opportunity, saturation, district ranking, risk, and capital logic. Scores stay tied to the backend analytics result.
              </p>
              <EvidenceList items={investor.highPotentialDistricts || investor.opportunities || result?.districtMetrics || []} />
            </IntelligenceCard>
            <IntelligenceCard title="Risk assessment" icon={ShieldCheck}>
              <EvidenceList items={risks} empty="No investor risk evidence was calculated." />
            </IntelligenceCard>
          </section>
        </>
      )}
    </PlatformPageShell>
  );
}
