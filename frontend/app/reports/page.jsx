"use client";

import { useState } from "react";
import { Download, FileText, Printer, ShieldCheck } from "lucide-react";
import { buildExportHtmlReport, buildExportReport } from "../../lib/api";
import { downloadBlob } from "../../lib/download";
import {
  AnalysisEmptyState,
  EvidenceList,
  IntelligenceCard,
  MetricTile,
  PlatformPageShell,
  getAnalysisSummary,
  useLatestAnalysis
} from "../../components/ui/platform-pages";

export default function ReportsPage() {
  const { result } = useLatestAnalysis();
  const [busy, setBusy] = useState(false);
  const summary = getAnalysisSummary(result);

  async function exportJson() {
    if (!result) return;
    downloadBlob(JSON.stringify(result, null, 2), "mercora-analysis.json", "application/json");
  }

  async function exportReportHtml() {
    if (!result) return;
    setBusy(true);
    try {
      const report = await buildExportReport({ result, language: "en" });
      if (report) {
        const html = report.html || report.printHtml || "";
        if (html) {
          downloadBlob(html, report.filename || "mercora-opportunity-report.html", "text/html");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function printPdf() {
    if (!result) return;
    setBusy(true);
    try {
      const html = await buildExportHtmlReport({ result, language: "en" });
      if (html) {
        const popup = window.open("", "_blank", "noopener,noreferrer");
        if (popup) {
          popup.document.write(html);
          popup.document.close();
          popup.focus();
          window.setTimeout(() => popup.print(), 350);
        } else {
          downloadBlob(html, "mercora-opportunity-report.html", "text/html");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <PlatformPageShell
      eyebrow="Reports"
      title="Professional opportunity reports"
      subtitle="Export opportunity analysis, SWOT, risk assessment, district comparison, and AI recommendations."
    >
      {!result ? (
        <AnalysisEmptyState title="Reports waiting for completed analysis" />
      ) : (
        <>
          <section className="platformMetricGrid">
            <MetricTile label="Success Probability" value={`${summary.successProbability}%`} detail={summary.bestDistrictDetail} icon={ShieldCheck} />
            <MetricTile label="Opportunity Score" value={`${summary.opportunityScore}/100`} detail={`Report basis: ${summary.businessType}`} icon={FileText} />
          </section>

          <section className="platformGrid two">
            <IntelligenceCard title="Report actions" icon={FileText}>
              <div className="platformActionStrip">
                <button type="button" onClick={printPdf} disabled={busy}><Printer size={16} /> Download PDF report</button>
                <button type="button" onClick={exportReportHtml} disabled={busy}><Download size={16} /> Download HTML report</button>
                <button type="button" onClick={exportJson} disabled={busy}><Download size={16} /> Download raw analysis</button>
              </div>
            </IntelligenceCard>
            <IntelligenceCard title="Report evidence" icon={ShieldCheck}>
              <EvidenceList items={result?.swotAnalysis?.strengths || result?.analyticsEngine?.riskAnalysis?.risks || []} empty="No SWOT or risk evidence was calculated." />
            </IntelligenceCard>
          </section>
        </>
      )}
    </PlatformPageShell>
  );
}
