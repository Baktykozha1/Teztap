function buildInvestorReport({ analysis }) {
  if (!analysis) {
    return {
      title: "TezTap Opportunity Intelligence Report",
      state: "empty",
      generatedAt: new Date().toISOString(),
      message: "Enter business data and run market analysis before generating a report.",
      sections: []
    };
  }

  const report = {
    title: "TezTap Opportunity Intelligence Report",
    subtitle: "AI-powered market intelligence for business opportunity discovery, evaluation, and validation.",
    state: "ready",
    generatedAt: new Date().toISOString(),
    identity:
      "We help entrepreneurs discover, evaluate, and validate business opportunities using AI-powered market intelligence.",
    methodology: {
      analyticsEngine: "Calculates opportunity, probability, risk, saturation, budget realism, district scores, pricing, and forecasts.",
      aiConsultant: "Explains calculated metrics, tradeoffs, risks, and recommendations without inventing scores."
    },
    executiveSummary: buildExecutiveSummary(analysis),
    opportunityAnalysis: buildOpportunityAnalysis(analysis),
    swotAnalysis: buildSwotAnalysis(analysis),
    districtComparison: buildDistrictComparison(analysis),
    riskAssessment: buildRiskAssessment(analysis),
    opportunityScores: buildOpportunityScores(analysis),
    aiRecommendations: buildAiRecommendations(analysis),
    cityEconomicIndicator: analysis.cityEconomicIndicator || null,
    investmentModule: analysis.investmentModule || null,
    ecosystemWorkflows: buildEcosystemWorkflows(analysis),
    budgetIntelligence: buildBudgetIntelligence(analysis),
    sourceQuality: buildSourceQuality(analysis)
  };

  const html = buildPrintHtml(report);

  return {
    ...report,
    sections: buildReportSections(report),
    filename: buildReportFilename(report),
    printHtml: html,
    html
  };
}

function buildReportFilename(report) {
  const city = slugify(report.executiveSummary?.city || "city");
  const businessType = slugify(report.executiveSummary?.businessType || "business");
  return `mercora-opportunity-report-${city}-${businessType}.html`;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "report";
}

function buildExecutiveSummary(analysis) {
  const scores = analysis.proprietaryScoring?.scores || {};
  const bestDistrict = analysis.recommendation?.bestArea || analysis.opportunityAreas?.[0]?.name || null;

  return {
    city: analysis.input?.city || null,
    businessType: analysis.profile?.title || analysis.input?.businessType || null,
    budget: analysis.input?.budget || analysis.budgetPlan?.inputBudget || 0,
    bestDistrict,
    verdict: analysis.recommendation?.explanation || "No executive recommendation was returned by the analytics engine.",
    successProbability: scores.successProbability ?? analysis.probability?.successProbability ?? 0,
    opportunityScore: scores.opportunityScore ?? analysis.opportunityScore?.score ?? 0,
    riskScore: scores.riskScore ?? analysis.analyticsEngine?.riskAnalysis?.riskScore ?? 0,
    why: buildWhy([
      `Best district: ${bestDistrict || "not available"}.`,
      `Opportunity score: ${scores.opportunityScore ?? analysis.opportunityScore?.score ?? 0}/100.`,
      `Success probability: ${scores.successProbability ?? analysis.probability?.successProbability ?? 0}%.`,
      `Budget realism: ${analysis.budgetPlan?.budgetRealismScore ?? 0}/100.`
    ])
  };
}

function buildOpportunityAnalysis(analysis) {
  const discovery = analysis.opportunityDiscovery?.commercialQuestionMap || {};
  const districtDetection = analysis.opportunityDiscovery?.districtOpportunityDetection || [];

  return {
    whatBusinessShouldIOpen: discovery.whatBusinessShouldIOpen || null,
    whereShouldIOpenIt: discovery.whereShouldIOpenIt || null,
    whyIsItGoodOpportunity: discovery.whyIsItGoodOpportunity || null,
    marketGaps: analysis.opportunityDiscovery?.marketGaps || [],
    districtOpportunityDetection: districtDetection.slice(0, 6).map((district) => ({
      district: district.district,
      opportunityScore: district.opportunityScore,
      missingServices: district.missingServices || [],
      underservedBusinessCategories: district.underservedBusinessCategories || [],
      marketOpportunities: district.marketOpportunities || [],
      why: district.answerSummary?.answer || "No district-specific opportunity explanation was returned."
    }))
  };
}

function buildSwotAnalysis(analysis) {
  const swot = analysis.strategicIntelligence?.swot || {};

  return {
    strengths: swot.strengths || [],
    weaknesses: swot.weaknesses || [],
    opportunities: swot.opportunities || [],
    threats: swot.threats || []
  };
}

function buildDistrictComparison(analysis) {
  const scenarioRows = analysis.proprietaryScoring?.comparisons?.scenarios || [];
  const districtRows = analysis.proprietaryScoring?.comparisons?.districts || analysis.analyticsEngine?.districtRankings || [];

  return {
    scenarios: scenarioRows.map((scenario) => ({
      label: scenario.label,
      businessType: scenario.businessType,
      district: scenario.district,
      successProbability: scenario.successProbability,
      riskScore: scenario.riskScore,
      opportunityScore: scenario.opportunityScore,
      why: scenario.why
    })),
    districts: districtRows.slice(0, 8).map((district) => ({
      district: district.district,
      opportunityScore: district.opportunityScore,
      risk: district.saturationScore != null ? `${district.saturationScore}/100 saturation pressure` : district.recommendation,
      investmentAttractiveness: district.investmentAttractiveness,
      growthPotential: district.growthPotential,
      why: district.why || district.explanation || "No explanation was returned for this district."
    }))
  };
}

function buildRiskAssessment(analysis) {
  const risk = analysis.analyticsEngine?.riskAnalysis || {};
  const risks = risk.risks?.length ? risk.risks : analysis.strategicIntelligence?.riskAnalysis || [];

  return {
    riskScore: risk.riskScore ?? analysis.proprietaryScoring?.scores?.riskScore ?? 0,
    level: risk.level || analysis.budgetPlan?.budgetRiskLevel || "Unknown",
    factors: risks.map((item) => ({
      label: item.label || item.title || "Risk",
      level: item.level || item.severity || "Unknown",
      evidence: item.evidence || item.description || "Risk is derived from current analytics."
    })),
    budgetRisk: {
      level: analysis.budgetPlan?.budgetRiskLevel || "Unknown",
      budgetRealismScore: analysis.budgetPlan?.budgetRealismScore || 0,
      budgetShortfall: analysis.budgetPlan?.budgetShortfall || 0,
      why: analysis.budgetPlan?.budgetSignal || "Budget risk was calculated by the budget model."
    }
  };
}

function buildOpportunityScores(analysis) {
  return {
    proprietaryScores: analysis.proprietaryScoring?.scores || {},
    probabilityScores: analysis.probabilityScores || analysis.probability || {},
    opportunityScore: analysis.opportunityScore || {},
    formulas: [
      ...(analysis.proprietaryScoring ? Object.entries(analysis.proprietaryScoring.formulaWeights || {}).map(([label, expression]) => ({ label, expression })) : []),
      ...(analysis.probability?.formulas || [])
    ]
  };
}

function buildAiRecommendations(analysis) {
  return {
    mainRecommendation: analysis.recommendation?.explanation || null,
    pricingStrategy: analysis.recommendation?.pricingStrategy || null,
    nextActions: analysis.recommendation?.nextActions || [],
    aiNarratives: analysis.aiNarratives || {},
    why: buildWhy([
      analysis.recommendation?.explanation,
      analysis.recommendation?.pricingStrategy,
      analysis.probability?.explanation
    ].filter(Boolean))
  };
}

function buildEcosystemWorkflows(analysis) {
  return {
    platformIdentity: analysis.ecosystemWorkflows?.platformIdentity || null,
    audiences: analysis.ecosystemWorkflows?.audiences || [],
    entrepreneurs: analysis.ecosystemWorkflows?.workflows?.entrepreneurs || null,
    franchises: analysis.ecosystemWorkflows?.workflows?.franchises || null,
    investors: analysis.ecosystemWorkflows?.workflows?.investors || null,
    banks: analysis.ecosystemWorkflows?.workflows?.banks || null,
    government: analysis.ecosystemWorkflows?.workflows?.government || null
  };
}

function buildBudgetIntelligence(analysis) {
  return {
    budgetPlan: analysis.budgetPlan || {},
    realisticCategories: analysis.proprietaryScoring?.budgetIntelligence?.realisticCategories || [],
    constrainedCategories: analysis.proprietaryScoring?.budgetIntelligence?.constrainedCategories || [],
    unrealisticCategories: analysis.proprietaryScoring?.budgetIntelligence?.unrealisticCategories || [],
    alternativeRecommendations: analysis.proprietaryScoring?.budgetIntelligence?.alternativeRecommendations || []
  };
}

function buildSourceQuality(analysis) {
  return {
    businesses: analysis.sources?.businesses || null,
    prices: analysis.sources?.prices || null,
    confidence: analysis.analyticsEngine?.confidence || null,
    guardrail: "No fake probabilities, opportunity scores, or hardcoded metrics are included. Missing evidence remains missing."
  };
}

function buildReportSections(report) {
  return [
    { title: "Executive Summary", data: report.executiveSummary },
    { title: "Opportunity Analysis", data: report.opportunityAnalysis },
    { title: "SWOT Analysis", data: report.swotAnalysis },
    { title: "District Comparison", data: report.districtComparison },
    { title: "Risk Assessment", data: report.riskAssessment },
    { title: "Opportunity Scores", data: report.opportunityScores },
    { title: "AI Recommendations", data: report.aiRecommendations },
    { title: "City-Wide Economic Indicator", data: report.cityEconomicIndicator },
    { title: "Investment Intelligence Module", data: report.investmentModule },
    { title: "Ecosystem Workflows", data: report.ecosystemWorkflows },
    { title: "Budget Intelligence", data: report.budgetIntelligence },
    { title: "Source Quality", data: report.sourceQuality }
  ];
}

function buildPrintHtml(report) {
  const sections = buildReportSections(report)
    .map((section) => `
      <section>
        <h2>${escapeHtml(section.title)}</h2>
        ${renderData(section.data)}
      </section>
    `)
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.title)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 40px; font-family: Inter, Arial, sans-serif; color: #111827; background: #f7f8fb; }
    main { max-width: 980px; margin: 0 auto; background: #fff; padding: 42px; border: 1px solid #e5e7eb; box-shadow: 0 18px 60px rgba(15, 23, 42, 0.10); }
    header { border-bottom: 2px solid #111827; padding-bottom: 22px; margin-bottom: 28px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    h2 { margin: 0 0 14px; font-size: 18px; }
    h3 { margin: 14px 0 8px; font-size: 13px; color: #374151; }
    p, li, td, th { font-size: 12px; line-height: 1.55; }
    section { break-inside: avoid; page-break-inside: avoid; margin: 0 0 24px; padding-bottom: 18px; border-bottom: 1px solid #e5e7eb; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { text-align: left; vertical-align: top; border: 1px solid #e5e7eb; padding: 8px; }
    th { background: #f3f4f6; }
    code { white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
    .meta { color: #4b5563; }
    @media print {
      body { background: #fff; padding: 0; }
      main { max-width: none; border: 0; padding: 0; box-shadow: none; }
      a { color: #111827; text-decoration: none; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(report.title)}</h1>
      <p>${escapeHtml(report.subtitle)}</p>
      <p class="meta">${escapeHtml(report.identity)} Generated ${escapeHtml(report.generatedAt)}.</p>
      <p class="meta">Analytics engine calculates. AI explains.</p>
    </header>
    ${sections}
  </main>
</body>
</html>`;
}

function renderData(value) {
  if (value == null) {
    return "<p>No data returned.</p>";
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      return "<p>No confirmed records in current analytics.</p>";
    }

    return `<ul>${value.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`;
  }

  if (typeof value === "object") {
    return `<table><tbody>${Object.entries(value)
      .map(([key, item]) => `<tr><th>${escapeHtml(formatLabel(key))}</th><td>${renderInline(item)}</td></tr>`)
      .join("")}</tbody></table>`;
  }

  return `<p>${escapeHtml(String(value))}</p>`;
}

function renderInline(value) {
  if (value == null) {
    return "n/a";
  }

  if (Array.isArray(value)) {
    return value.length ? `<ul>${value.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>` : "No confirmed records.";
  }

  if (typeof value === "object") {
    return `<code>${escapeHtml(JSON.stringify(value, null, 2))}</code>`;
  }

  return escapeHtml(String(value));
}

function buildWhy(parts) {
  return parts.filter(Boolean).join(" ");
}

function formatLabel(value) {
  return String(value).replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = {
  buildInvestorReport
};
