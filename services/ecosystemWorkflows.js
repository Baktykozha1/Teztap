function buildEcosystemWorkflows({ result }) {
  const districtComparison = result.proprietaryScoring?.comparisons?.districts || [];
  const budgetFit = result.proprietaryScoring?.budgetIntelligence || {};
  const risk = result.analyticsEngine?.riskAnalysis || {};

  return {
    layer: "TezTap Geo-Economic Intelligence Workflows",
    version: "1.0",
    platformIdentity:
      "TezTap helps entrepreneurs, operators, capital providers, and public-sector teams discover, evaluate, and validate business opportunities using AI-powered market intelligence.",
    audiences: [
      "Entrepreneurs",
      "Small Businesses",
      "Franchises",
      "Investors",
      "Banks",
      "Consulting Firms",
      "Retail Chains",
      "Real Estate Developers",
      "Government Agencies",
      "Economic Development Organizations"
    ],
    workflows: {
      entrepreneurs: buildEntrepreneurWorkflow({ result, districtComparison, budgetFit, risk }),
      franchises: buildFranchiseWorkflow({ result, districtComparison, risk }),
      investors: buildInvestorWorkflow({ result, districtComparison, risk }),
      banks: buildBankWorkflow({ result, districtComparison, risk }),
      government: buildGovernmentWorkflow({ result, districtComparison, risk })
    },
    guardrail: "Workflow recommendations are derived from current analytics. Missing evidence is shown as missing, not guessed."
  };
}

function buildEntrepreneurWorkflow({ result, districtComparison, budgetFit, risk }) {
  const selectedCategory = result.profile?.title || result.input?.businessType || "Selected business";
  const bestDistrict = districtComparison[0] || null;
  const opportunities = result.opportunityDiscovery?.marketGaps || result.strategicIntelligence?.marketGapDetection || [];

  return {
    title: "Entrepreneur Opportunity Discovery",
    purpose: "Find a viable business idea, location, budget path, and risk profile for a launch decision.",
    businessIdeas: buildBusinessIdeas({ selectedCategory, budgetFit, result }),
    locationSelection: {
      recommendedDistrict: bestDistrict?.district || result.recommendation?.bestArea || null,
      score: bestDistrict?.investmentAttractiveness ?? result.opportunityScore?.score ?? 0,
      why: bestDistrict?.why || result.recommendation?.explanation || "No district explanation was returned."
    },
    riskAnalysis: {
      riskScore: risk.riskScore ?? result.proprietaryScoring?.scores?.riskScore ?? 0,
      level: risk.level || result.budgetPlan?.budgetRiskLevel || "Unknown",
      topRisks: (risk.risks || result.strategicIntelligence?.riskAnalysis || []).slice(0, 4)
    },
    marketOpportunities: opportunities.slice(0, 5).map((opportunity) => ({
      district: opportunity.district || opportunity.area,
      score: opportunity.priorityScore ?? opportunity.underservedScore ?? 0,
      why: opportunity.explanation || opportunity.signal || "Opportunity is derived from underserved demand and competition metrics."
    }))
  };
}

function buildFranchiseWorkflow({ result, districtComparison, risk }) {
  const competitorCount = result.market?.competitorCount || 0;
  const totalDistricts = districtComparison.length;
  const priorityDistricts = districtComparison.filter((district) => district.recommendation === "priority district");
  const pilotDistricts = districtComparison.filter((district) => district.recommendation === "pilot candidate");

  return {
    title: "Franchise Expansion Intelligence",
    purpose: "Plan branch expansion, compare districts, monitor competitor pressure, and estimate market penetration.",
    expansionPlanning: {
      priorityDistricts: priorityDistricts.slice(0, 4),
      pilotDistricts: pilotDistricts.slice(0, 4),
      why: priorityDistricts[0]?.why || pilotDistricts[0]?.why || "No expansion district met the current scoring threshold."
    },
    newBranchPlacement: districtComparison.slice(0, 5).map((district) => ({
      district: district.district,
      investmentAttractiveness: district.investmentAttractiveness,
      opportunityScore: district.opportunityScore,
      risk: district.saturationScore,
      why: district.why
    })),
    competitorMonitoring: {
      competitorCount,
      density: result.market?.density || "Unknown",
      highestPressureDistrict: result.analyticsEngine?.competitionDensity?.highestDensityDistrict || null,
      lowestPressureDistrict: result.analyticsEngine?.competitionDensity?.lowestDensityDistrict || null,
      why: `${competitorCount} competitors and ${result.market?.density || "unknown density"} define the current expansion pressure.`
    },
    marketPenetrationAnalysis: {
      analyzedDistricts: totalDistricts,
      priorityDistrictCount: priorityDistricts.length,
      pilotDistrictCount: pilotDistricts.length,
      riskLevel: risk.level || "Unknown",
      why: `Penetration potential is based on ${totalDistricts} ranked districts, saturation pressure, competition density, and investment attractiveness.`
    }
  };
}

function buildInvestorWorkflow({ result, districtComparison, risk }) {
  const scores = result.proprietaryScoring?.scores || {};
  const growth = result.analyticsEngine?.growthPotential || {};
  const topDistrict = districtComparison[0] || null;

  return {
    title: "Investor Opportunity Intelligence",
    purpose: "Discover investable business opportunities, compare district attractiveness, evaluate growth potential, and identify downside risk.",
    investmentOpportunityDiscovery: {
      opportunityScore: scores.opportunityScore ?? result.opportunityScore?.score ?? 0,
      successProbability: scores.successProbability ?? result.probability?.successProbability ?? 0,
      investmentAttractiveness: scores.investmentAttractiveness ?? topDistrict?.investmentAttractiveness ?? 0,
      why: result.recommendation?.explanation || "Opportunity is based on scoring, budget realism, district demand, pricing evidence, and competition pressure."
    },
    districtAttractiveness: districtComparison.slice(0, 6).map((district) => ({
      district: district.district,
      investmentAttractiveness: district.investmentAttractiveness,
      opportunityScore: district.opportunityScore,
      why: district.why
    })),
    growthPotential: {
      score: scores.growthPotential ?? growth.topDistrict?.growthScore ?? 0,
      topDistrict: growth.topDistrict || topDistrict,
      why: growth.topDistrict?.explanation || topDistrict?.why || "Growth potential uses underserved demand, foot traffic, saturation relief, and competition relief."
    },
    riskEvaluation: {
      riskScore: risk.riskScore ?? scores.riskScore ?? 0,
      level: risk.level || "Unknown",
      factors: (risk.risks || result.strategicIntelligence?.riskAnalysis || []).slice(0, 5),
      why: risk.explanation || "Risk is calculated from budget realism, saturation, competition, and pricing evidence."
    }
  };
}

function buildBankWorkflow({ result, districtComparison, risk }) {
  const budgetPlan = result.budgetPlan || {};
  const scores = result.proprietaryScoring?.scores || {};

  return {
    title: "Bank Loan Risk Intelligence",
    purpose: "Assess business loan risk, market viability, district intelligence, budget realism, and repayment-sensitive business fundamentals.",
    businessLoanRiskAssessment: {
      riskScore: risk.riskScore ?? scores.riskScore ?? 0,
      level: risk.level || budgetPlan.budgetRiskLevel || "Unknown",
      budgetRealismScore: budgetPlan.budgetRealismScore || 0,
      runwayMonths: budgetPlan.runwayMonths || 0,
      breakEvenTransactions: budgetPlan.breakEvenTransactions || null,
      why: budgetPlan.budgetSignal || risk.explanation || "Loan risk uses capital adequacy, runway, break-even volume, pricing evidence, and saturation pressure."
    },
    marketViabilityEvaluation: {
      successProbability: scores.successProbability ?? result.probability?.successProbability ?? 0,
      opportunityScore: scores.opportunityScore ?? result.opportunityScore?.score ?? 0,
      profitabilityProbability: result.probability?.profitabilityProbability ?? 0,
      projectedNetProfit: result.probability?.assumptions?.projectedNetProfit ?? 0,
      why: result.probability?.explanation || "Viability is calculated from budget, competition, demand, pricing, saturation, and district conditions."
    },
    districtIntelligence: districtComparison.slice(0, 5).map((district) => ({
      district: district.district,
      opportunityScore: district.opportunityScore,
      risk: district.saturationScore,
      investmentAttractiveness: district.investmentAttractiveness,
      why: district.why
    })),
    creditPolicySignals: {
      collateralSensitive: Boolean(budgetPlan.isBelowMinimum || budgetPlan.runwayMonths < 6),
      needsFieldValidation: (result.stats?.sampleCount || 0) < 4 || (result.market?.competitorCount || 0) < 3,
      why: "Credit policy signals flag thin evidence, short runway, and budget shortfalls without inventing repayment assumptions."
    }
  };
}

function buildGovernmentWorkflow({ result, districtComparison, risk }) {
  const gaps = result.opportunityDiscovery?.marketGaps || result.strategicIntelligence?.marketGapDetection || [];
  const underservedDistricts = districtComparison
    .filter((district) => district.underservedScore >= 55)
    .slice(0, 6);

  return {
    title: "Government Economic Development Intelligence",
    purpose: "Identify underserved districts, local business gaps, SME support zones, market saturation, and evidence-based development priorities.",
    underservedDistricts: underservedDistricts.map((district) => ({
      district: district.district,
      underservedScore: district.underservedScore,
      opportunityScore: district.opportunityScore,
      why: district.why
    })),
    marketGapAnalysis: gaps.slice(0, 6).map((gap) => ({
      district: gap.district || gap.area,
      score: gap.priorityScore ?? gap.underservedScore ?? 0,
      directCompetitors: gap.directCompetitors ?? 0,
      nearbyCompetitors: gap.nearbyCompetitors ?? 0,
      why: gap.explanation || gap.signal || "Gap is derived from underserved demand and low competition."
    })),
    saturationMonitoring: {
      highRiskDistricts: result.analyticsEngine?.saturation?.highRiskDistricts || [],
      attractiveDistricts: result.analyticsEngine?.saturation?.attractiveDistricts || [],
      why: "Saturation monitoring uses nearby competitors, district saturation, and underserved demand."
    },
    smeSupportPriorities: {
      riskLevel: risk.level || "Unknown",
      priorityDistrictCount: underservedDistricts.length,
      evidenceConfidence: result.analyticsEngine?.confidence?.score ?? 0,
      why: "SME support priorities are based on underserved demand, district opportunity scores, market gaps, and evidence confidence."
    }
  };
}

function buildBusinessIdeas({ selectedCategory, budgetFit, result }) {
  const ideas = [];
  const currentBudget = result.input?.budget || result.budgetPlan?.inputBudget || 0;

  ideas.push({
    idea: selectedCategory,
    viability: result.budgetPlan?.isBelowMinimum ? "constrained" : "realistic",
    requiredBudget: result.budgetPlan?.minimumViableBudget || 0,
    currentBudget,
    why: result.budgetPlan?.isBelowMinimum
      ? `${selectedCategory} is constrained because the budget is ${result.budgetPlan.budgetShortfall} KZT below the minimum viable threshold.`
      : `${selectedCategory} is realistic for the current budget with ${result.budgetPlan?.budgetRealismScore || 0}/100 budget realism.`
  });

  for (const recommendation of budgetFit.alternativeRecommendations || []) {
    ideas.push({
      idea: recommendation.title,
      viability: recommendation.type === "scope_reduction" ? "constrained" : "alternative",
      requiredBudget: null,
      currentBudget,
      why: recommendation.reason
    });
  }

  return ideas.slice(0, 5);
}

module.exports = {
  buildEcosystemWorkflows
};
