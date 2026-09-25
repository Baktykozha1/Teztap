"use client";

import { motion } from "framer-motion";
import { Activity, Calculator, DatabaseZap, LineChart, Radar, Route } from "lucide-react";

export function InvestorConsole({ result, liveAnalytics }) {
  const dataRoomScore = result?.investorDecision?.dataRoom?.score ?? result?.probability?.assumptions?.evidenceScore ?? null;
  const decision = result?.investorDecision?.decision || "Awaiting market run";
  const metricStack = [
    { label: "BOI Score", value: result?.marketGapEngine?.boi?.score != null ? `${result.marketGapEngine.boi.score}/100` : "n/a", icon: Activity },
    { label: "Competitors", value: result?.market?.competitorCount ?? "n/a", icon: DatabaseZap },
    { label: "Price samples", value: result?.stats?.sampleCount ?? "n/a", icon: LineChart },
    { label: "District records", value: result?.districtMetrics?.length ?? "n/a", icon: Radar },
    { label: "Budget realism", value: result?.budgetPlan?.budgetRealismScore != null ? `${result.budgetPlan.budgetRealismScore}/100` : "n/a", icon: Calculator },
    { label: "Success probability", value: result?.probability?.successProbability != null ? `${result.probability.successProbability}%` : "n/a", icon: Activity },
    { label: "Break-even", value: result?.budgetPlan?.breakEvenTransactions != null ? `${result.budgetPlan.breakEvenTransactions} sales/mo` : "n/a", icon: Route }
  ];

  return (
    <motion.section className="ventureConsole" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="ventureConsoleHeader">
        <div>
          <span className="eyebrow"><Calculator size={14} /> Platform calculations</span>
          <h2>Evidence summary</h2>
        </div>
        <strong>{dataRoomScore != null ? `${dataRoomScore}/100` : "n/a"}</strong>
      </div>

      <div className="capabilityGrid">
        {metricStack.map((item) => (
          <article key={item.label}>
            <item.icon size={17} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>

      <div className="decisionRail">
        <span>Investment readout</span>
        <strong>{decision}</strong>
      </div>

      {liveAnalytics?.length ? (
        <div className="signalRail">
          {liveAnalytics.map((item) => (
            <span key={item.label} className={`signal ${item.tone}`}>
              {item.label}: {item.value}
            </span>
          ))}
        </div>
      ) : null}
    </motion.section>
  );
}
