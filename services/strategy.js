function buildInvestorDecisionLayer({ result }) {
  const baseNetProfit = Number(result.probability?.assumptions?.projectedNetProfit) || 0;
  const baseRevenue = Number(result.probability?.assumptions?.projectedMonthlyRevenue) || 0;
  const operatingCost = Number(result.budgetPlan?.monthlyOperatingCost) || 0;
  const transactions = Number(result.probability?.assumptions?.monthlyTransactions) || 0;
  const priceBasis = Number(result.probability?.assumptions?.priceBasis) || Number(result.stats?.avgPrice) || 0;
  const margin = Number(result.probability?.assumptions?.targetMarginPercent)
    ? Number(result.probability.assumptions.targetMarginPercent) / 100
    : 0;
  const bestArea = result.opportunityAreas?.[0] || null;
  const secondArea = result.opportunityAreas?.[1] || null;
  const evidenceScore = Number(result.probability?.assumptions?.evidenceScore) || 0;
  const runwayMonths = Number(result.budgetPlan?.runwayMonths) || 0;
  const breakEven = result.budgetPlan?.breakEvenTransactions ?? null;
  const paybackMonths = result.probability?.assumptions?.paybackMonths || null;
  const dataConfidence = calculateDataConfidence({ result, evidenceScore });

  return {
    investmentMemo: {
      verdict: getVerdict(result.opportunityScore.score, result.probability.successProbability, dataConfidence.score),
      thesis: buildThesis({ result, bestArea, dataConfidence }),
      whyNow: buildWhyNow({ result, bestArea }),
      keyRisk: buildKeyRisk({ result, dataConfidence }),
      mitigation: buildMitigation({ result, bestArea }),
      fundingUse: [
        { label: "Launch reserve", value: result.budgetPlan.startupReserve },
        { label: "Usable operating budget", value: result.budgetPlan.usableBudget },
        { label: "Monthly operating cost", value: operatingCost },
        { label: "Minimum viable budget", value: result.budgetPlan.minimumViableBudget },
        { label: "Funding gap", value: result.budgetPlan.budgetShortfall || 0 }
      ]
    },
    scenarios: priceBasis && transactions && margin
      ? [
          buildScenario({
            name: "Base model",
            description: "Uses the current average price, planned transactions, target margin, and operating cost.",
            transactions,
            price: priceBasis,
            margin,
            operatingCost
          })
        ]
      : [],
    dataRoom: {
      score: dataConfidence.score,
      label: dataConfidence.label,
      checks: [
        {
          label: "Competitor coverage",
          status: result.competitors.length >= 8 ? "Strong" : result.competitors.length >= 4 ? "Usable" : "Thin",
          value: `${result.competitors.length} businesses`
        },
        {
          label: "Product price evidence",
          status: result.stats.sampleCount >= 10 ? "Strong" : result.stats.sampleCount >= 4 ? "Usable" : "Needs validation",
          value: `${result.stats.sampleCount} samples`
        },
        {
          label: "Location model",
          status: result.opportunityAreas.length >= 3 ? "Strong" : "Needs more districts",
          value: `${result.opportunityAreas.length} districts`
        },
        {
          label: "Budget realism",
          status: result.budgetPlan.isBelowMinimum ? "Underfunded" : result.budgetPlan.budgetRiskLevel,
          value: `${result.budgetPlan.budgetRealismScore}/100`
        },
        {
          label: "Runway",
          status: runwayMonths >= 6 ? "Strong" : "Fragile",
          value: `${runwayMonths} months`
        }
      ],
      sources: result.sources
    },
    executionRoadmap: buildRoadmap({ result, bestArea, secondArea, breakEven, paybackMonths }),
    boardMetrics: [
      { label: "Monthly revenue", value: baseRevenue, kind: "money" },
      { label: "Monthly net profit", value: baseNetProfit, kind: "money" },
      { label: "Break-even volume", value: breakEven, suffix: " sales/mo" },
      { label: "Payback", value: paybackMonths || "Not positive", suffix: paybackMonths ? " months" : "" }
    ]
  };
}

function calculateDataConfidence({ result, evidenceScore }) {
  const sourceScore = result.sources?.businesses?.mode === "live-overpass" ? 18 : 12;
  const competitorScore = Math.min(30, result.competitors.length * 3);
  const priceScore = Math.min(28, result.stats.sampleCount * 3);
  const districtScore = Math.min(14, result.opportunityAreas.length * 4);
  const modeledScore = Math.min(10, Math.round(evidenceScore / 10));
  const budgetScore = Math.min(18, Math.round((Number(result.budgetPlan?.budgetRealismScore) || 1) * 0.18));
  const score = clampScore(sourceScore + competitorScore + priceScore + districtScore + modeledScore + budgetScore - 12);

  return {
    score,
    label: score >= 78 ? "Investor diligence ready" : score >= 58 ? "Pilot-ready evidence" : "Validation required"
  };
}

function buildScenario({ name, description, transactions, price, margin, operatingCost }) {
  const revenue = Math.round(transactions * price);
  const grossProfit = Math.round(revenue * margin);
  const netProfit = grossProfit - operatingCost;
  const grossProfitPerTransaction = Math.round(price * margin);
  const breakEvenTransactions = grossProfitPerTransaction
    ? Math.ceil(operatingCost / Math.max(1, grossProfitPerTransaction))
    : null;

  return {
    name,
    description,
    transactions,
    price,
    marginPercent: Math.round(margin * 100),
    revenue,
    grossProfit,
    operatingCost,
    netProfit,
    breakEvenTransactions,
    status: netProfit > 0 ? "Profitable" : "Below break-even"
  };
}

function buildRoadmap({ result, bestArea, secondArea, breakEven, paybackMonths }) {
  return [
    {
      phase: "0-14 days",
      title: "Validate evidence",
      outcome: result.stats.sampleCount >= 8
        ? "Refresh competitor and price evidence before signing."
        : `Collect at least ${8 - result.stats.sampleCount} more product-level price sample(s) before locking the offer.`
    },
    {
      phase: "15-45 days",
      title: "Pilot district",
      outcome: bestArea
        ? breakEven
          ? `Test ${bestArea.name} first and measure whether weekly demand can reach ${Math.ceil(breakEven / 4)} sales.`
          : `Test ${bestArea.name} only after product-level price samples produce a break-even volume.`
        : "Run a district shortlist before committing launch capital."
    },
    {
      phase: "46-90 days",
      title: "Scale or pause gate",
      outcome: paybackMonths && paybackMonths <= 12
        ? `Scale only if payback remains under ${paybackMonths} months and repeat purchase signal is visible.`
        : "Pause expansion until monthly net profit turns positive."
    },
    {
      phase: "Next district",
      title: "Expansion option",
      outcome: secondArea
        ? `${secondArea.name} is the next ranked expansion candidate at ${secondArea.score}/100.`
        : "Add more district coverage before building an expansion case."
    }
  ];
}

function getVerdict(score, probability, confidence) {
  if (probability < 35) {
    return "Do not launch before capital reset";
  }

  if (score >= 75 && probability >= 70 && confidence >= 58) {
    return "Proceed to controlled launch";
  }

  if (score >= 58 && probability >= 55) {
    return "Run a validation pilot";
  }

  return "Do not scale before validation";
}

function buildThesis({ result, bestArea, dataConfidence }) {
  if (result.budgetPlan.isBelowMinimum) {
    return `${result.profile.title} in ${result.input.city} is financially underfunded: the submitted ${result.budgetPlan.inputBudget} KZT budget is below the ${result.budgetPlan.minimumViableBudget} KZT minimum viable threshold, creating a ${result.budgetPlan.budgetShortfall} KZT funding gap. The modeled success probability is ${result.probability.successProbability}% because budget realism, runway, competition, saturation, demand, and district economics are all included in the calculation.`;
  }

  const districtText = bestArea
    ? `${bestArea.name} ranks first with ${bestArea.score}/100, ${bestArea.footTraffic}/100 foot traffic, and ${bestArea.underservedScore}/100 underserved demand.`
    : "No ranked district was returned.";

  return `${result.profile.title} in ${result.input.city} scores ${result.opportunityScore.score}/100 with ${result.probability.successProbability}% modeled success probability. ${districtText} Evidence confidence is ${dataConfidence.score}/100.`;
}

function buildWhyNow({ result, bestArea }) {
  if (!bestArea) {
    return `No district timing case was generated because ranked district data is missing.`;
  }

  return `${bestArea.name}: ${bestArea.footTraffic}/100 foot traffic, ${bestArea.underservedScore}/100 underserved demand, ${bestArea.competitorCountNearby} nearby competitors, ${result.market.density.toLowerCase()}.`;
}

function buildKeyRisk({ result, dataConfidence }) {
  if (result.budgetPlan.isBelowMinimum) {
    return `The budget is below the minimum viable threshold for this business category, so launch viability is constrained before market demand is considered.`;
  }

  if (result.stats.sampleCount < 4) {
    return "Product-level price evidence is thin, so unit economics need field validation.";
  }

  if (result.budgetPlan.runwayMonths < 6) {
    return "Runway is below the six-month threshold investors usually expect for a controlled pilot.";
  }

  if (dataConfidence.score < 58) {
    return "The market signal is directionally useful but not yet diligence-grade.";
  }

  return `Modeled monthly net profit is ${result.probability.assumptions.projectedNetProfit} KZT, break-even volume is ${result.budgetPlan.breakEvenTransactions ?? "n/a"} sales/mo, and evidence confidence is ${dataConfidence.score}/100.`;
}

function buildMitigation({ result, bestArea }) {
  if (result.budgetPlan.isBelowMinimum) {
    return `Raise at least ${result.budgetPlan.budgetShortfall} KZT or reduce the launch scope before treating this as viable.`;
  }

  if (result.stats.sampleCount < 4) {
    return "Collect competitor menus, receipts, and public price records before final pricing.";
  }

  if (result.budgetPlan.runwayMonths < 6) {
    return "Reduce fit-out cost, negotiate rent holidays, or increase capital before launch.";
  }

  return bestArea
    ? `Start in ${bestArea.name}, track weekly sales against break-even, and delay expansion until monthly net profit is positive.`
    : "Do not choose a lease until ranked district data is available.";
}

function clampScore(value) {
  return Math.max(1, Math.min(100, Math.round(Number(value) || 0)));
}

module.exports = {
  buildInvestorDecisionLayer
};
