"use client";

import { Bot, BrainCircuit, Gauge, ShieldAlert, Target, TrendingUp } from "lucide-react";
import {
  AnalysisEmptyState,
  EvidenceList,
  IntelligenceCard,
  MetricTile,
  PlatformPageShell,
  getAnalysisSummary,
  useLatestAnalysis
} from "../../components/ui/platform-pages";

export default function AssistantPage() {
  const { result } = useLatestAnalysis();
  const summary = getAnalysisSummary(result);
  const risks = result?.analyticsEngine?.riskAnalysis?.risks || result?.riskAnalysis?.risks || [];
  const recommendations = result?.aiRecommendations || result?.recommendations || result?.marketGapEngine?.opportunities || [];

  return (
    <PlatformPageShell
      eyebrow="AI Consultant"
      title="Strategic business advisor"
      subtitle="Consultant-grade interpretation of calculated analytics, district scores, market risks, and opportunity signals."
    >
      {!result ? (
        <AnalysisEmptyState title="AI Consultant waiting for analysis" />
      ) : (
        <>
          <section className="platformMetricGrid">
            <MetricTile label="Success Probability" value={`${summary.successProbability}%`} detail={`Based on ${summary.businessType} in ${summary.city}.`} icon={Gauge} />
            <MetricTile label="Opportunity Score" value={`${summary.opportunityScore}/100`} detail={summary.bestDistrictDetail} icon={Target} />
            <MetricTile label="Risk Score" value={`${summary.riskScore}/100`} detail="Higher score means higher business risk." icon={ShieldAlert} />
            <MetricTile label="Investment Appeal" value={`${summary.investmentAttractiveness}/100`} detail={`Budget: ${summary.budget}`} icon={TrendingUp} />
          </section>

          <section className="platformGrid two">
            <IntelligenceCard title="Consultant thesis" icon={BrainCircuit}>
              <p className="platformLead">
                TezTap ranks <strong>{summary.bestDistrict}</strong> as the strongest current option because the analytics engine combines district opportunity, competition pressure, saturation, pricing, and risk signals before the AI layer explains the outcome.
              </p>
            </IntelligenceCard>

            <IntelligenceCard title="AI recommendations" icon={Bot}>
              <EvidenceList items={recommendations} empty="No recommendation evidence was calculated for this analysis." />
            </IntelligenceCard>

            <IntelligenceCard title="Risk factors" icon={ShieldAlert}>
              <EvidenceList items={risks} empty="No risk factors were calculated for this analysis." />
            </IntelligenceCard>

            <IntelligenceCard title="District intelligence" icon={Target}>
              <EvidenceList items={result?.districtMetrics || []} empty="No district rankings were returned." />
            </IntelligenceCard>
          </section>
        </>
      )}
    </PlatformPageShell>
  );
}
