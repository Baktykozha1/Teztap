const { spawn } = require("node:child_process");
const { loadEnv } = require("../services/env");

loadEnv();

const PORT = Number(process.env.PORT || 5050);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const fetch = (url, options = {}) => globalThis.fetch(url, {
  ...options,
  headers: { ...options.headers, ...(process.env.MERCORA_VERIFY_TOKEN ? { Authorization: `Bearer ${process.env.MERCORA_VERIFY_TOKEN}` } : {}) }
});

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  const server = spawn(process.execPath, ["index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForHealth(BASE_URL);

    const response = await fetch(`${BASE_URL}/api/analyze-market`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        city: "Aktau",
        budget: 5000000,
        businessType: "grocery"
      })
    });

    if (!response.ok) {
      throw new Error(`Expected 200 from analyze-market endpoint, received ${response.status}`);
    }

    const data = await response.json();
    if (!process.env.MERCORA_VERIFY_TOKEN) {
      if (!Array.isArray(data.competitors) || !data.market || data.opportunityScore || data.probability || data.projectedMarket) {
        throw new Error("Basic analysis response contains unexpected or premium fields");
      }
      const denied = await fetch(`${BASE_URL}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Hello" }) });
      if (denied.status !== 401) throw new Error("Anonymous AI access was not rejected");
      console.log("Basic backend verification passed. Run npm run test:access for the complete authorization matrix.");
      return;
    }

    if (
      !Array.isArray(data.competitors) ||
      !data.recommendation ||
      !data.stats ||
      !data.analytics ||
      !data.probability ||
      !data.charts ||
      !data.aiNarratives ||
      !data.investorDecision ||
      !data.proprietaryScoring ||
      !data.opportunityDiscovery ||
      !data.marketGapEngine ||
      !data.cityEconomicIndicator ||
      !data.investmentModule ||
      !data.ecosystemWorkflows
    ) {
      throw new Error("Analyze-market endpoint returned an unexpected response shape.");
    }

    const cityIndicatorsResponse = await fetch(`${BASE_URL}/api/city-indicators?city=Aktau&businessType=grocery`);

    if (!cityIndicatorsResponse.ok) {
      throw new Error(`Expected 200 from city indicators endpoint, received ${cityIndicatorsResponse.status}`);
    }

    const cityIndicatorsData = await cityIndicatorsResponse.json();

    if (!Array.isArray(cityIndicatorsData.indicators) || !cityIndicatorsData.indicators.length) {
      throw new Error("City indicators endpoint should return historical snapshots created by real analyses.");
    }

    const competitorsResponse = await fetch(`${BASE_URL}/api/competitors?city=Aktau&businessType=grocery`);

    if (!competitorsResponse.ok) {
      throw new Error(`Expected 200 from competitors endpoint, received ${competitorsResponse.status}`);
    }

    const competitorsData = await competitorsResponse.json();

    if (!Array.isArray(competitorsData.competitors) || !competitorsData.market || competitorsData.probability) {
      throw new Error("Competitors endpoint should return a lightweight market snapshot without full scoring payloads.");
    }

    const pricesResponse = await fetch(`${BASE_URL}/api/prices?city=Aktau&businessType=grocery`);

    if (!pricesResponse.ok) {
      throw new Error(`Expected 200 from prices endpoint, received ${pricesResponse.status}`);
    }

    const pricesData = await pricesResponse.json();

    if (!Array.isArray(pricesData.prices) || !pricesData.stats || pricesData.probability) {
      throw new Error("Prices endpoint should return a lightweight price snapshot without full scoring payloads.");
    }

    const lowBudgetResponse = await fetch(`${BASE_URL}/api/analyze-market`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        city: "Aktau",
        budget: 1,
        businessType: "coffee_shop"
      })
    });

    if (!lowBudgetResponse.ok) {
      throw new Error(`Expected 200 from low-budget analyze-market endpoint, received ${lowBudgetResponse.status}`);
    }

    const lowBudgetData = await lowBudgetResponse.json();

    if (
      lowBudgetData.probability.successProbability > 10 ||
      lowBudgetData.probability.survivalProbability > 10 ||
      lowBudgetData.budgetPlan.budgetRiskLevel !== "Critical" ||
      !lowBudgetData.budgetPlan.isBelowMinimum ||
      lowBudgetData.budgetPlan.minimumViableBudget !== 8000000
    ) {
      throw new Error("Low-budget probability guard failed: unrealistic budget did not strongly reduce viability.");
    }

    const chatResponse = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Where should I open?" }],
        analysis: data,
        language: "en"
      })
    });

    if (!chatResponse.ok) {
      throw new Error(`Expected 200 from chat endpoint, received ${chatResponse.status}`);
    }

    const chatData = await chatResponse.json();

    if (
      !chatData.aiMessage ||
      !Array.isArray(chatData.insights) ||
      typeof chatData.confidenceScore !== "number" ||
      !chatData.aiConfidence ||
      !["High", "Medium", "Low"].includes(chatData.aiConfidence.label) ||
      !chatData.linkedAnalytics ||
      !Array.isArray(chatData.recommendedDistricts) ||
      !Array.isArray(chatData.riskFactors) ||
      !Array.isArray(chatData.underservedMarketDetection) ||
      !Array.isArray(chatData.comparativeSimulations)
    ) {
      throw new Error("Chat endpoint did not return the premium consultant intelligence contract.");
    }

    const reportResponse = await fetch(`${BASE_URL}/api/export/report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ analysis: data })
    });

    if (!reportResponse.ok) {
      throw new Error(`Expected 200 from export endpoint, received ${reportResponse.status}`);
    }

    const reportData = await reportResponse.json();

    if (!reportData.html || !reportData.printHtml || !reportData.filename) {
      throw new Error("Export endpoint did not return the expected HTML report contract.");
    }

    const reportHtmlResponse = await fetch(`${BASE_URL}/api/export/report/html`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ analysis: data })
    });

    if (!reportHtmlResponse.ok) {
      throw new Error(`Expected 200 from export HTML endpoint, received ${reportHtmlResponse.status}`);
    }

    const reportHtml = await reportHtmlResponse.text();

    if (!reportHtml.includes("Mercora Opportunity Intelligence Report")) {
      throw new Error("Export HTML endpoint did not return the expected report markup.");
    }

    console.log("Backend verification passed.");
  } finally {
    server.kill();
  }

  if (/EADDRINUSE|SyntaxError|Error/i.test(output)) {
    throw new Error(output.trim());
  }
}

async function waitForHealth(baseUrl) {
  const deadline = Date.now() + 7000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);

      if (response.ok) {
        return;
      }
    } catch {
      await delay(250);
    }
  }

  throw new Error("Backend did not become healthy in time.");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
