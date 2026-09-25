const { fork } = require("node:child_process");
const { loadEnv } = require("../services/env");

loadEnv();

const BACKEND_PORT = Number(process.env.PORT || 5100);
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 3100);
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  const app = fork("scripts/dev.js", {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      FRONTEND_PORT: String(FRONTEND_PORT)
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true
  });

  let output = "";
  app.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  app.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitFor(`${FRONTEND_URL}/api/health`, 20000);

    const page = await fetch(FRONTEND_URL);
    const html = await page.text();

    if (!page.ok || !html.includes("Mercora")) {
      throw new Error("Frontend did not return the expected page.");
    }

    const sectionRoutes = ["/analyze", "/map", "/education", "/jobs", "/services", "/marketplace", "/places", "/profile", "/favorites"];
    const sectionResponses = await Promise.all(sectionRoutes.map((route) => fetch(`${FRONTEND_URL}${route}`)));
    const unavailableRoute = sectionRoutes.find((route, index) => !sectionResponses[index].ok);
    if (unavailableRoute) {
      throw new Error(`Super app section ${unavailableRoute} returned ${sectionResponses[sectionRoutes.indexOf(unavailableRoute)].status}.`);
    }

    const featureKeys = [...html.matchAll(/data-main-feature="([^"]+)"/g)].map((match) => match[1]);
    if (featureKeys.length !== 6 || featureKeys.join(",") !== "mercora,education,jobs,services,marketplace,places") {
      throw new Error(`Home screen should render exactly six features in order; received: ${featureKeys.join(", " )}.`);
    }

    const searchPage = await fetch(`${FRONTEND_URL}/search?q=${encodeURIComponent("кафе")}`);
    if (!searchPage.ok || !(await searchPage.text()).includes("Mercora")) {
      throw new Error("Global search page did not return a usable result screen.");
    }

    const mercoraAlias = await fetch(`${FRONTEND_URL}/mercora`, { redirect: "manual" });
    if (![301, 302, 307, 308].includes(mercoraAlias.status) || mercoraAlias.headers.get("location") !== "/analyze") {
      throw new Error("The Mercora route does not preserve the original analysis page as its canonical implementation.");
    }

    const analysis = await fetch(`${FRONTEND_URL}/api/analyze-market`, {
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

    if (!analysis.ok) {
      throw new Error(`Frontend proxy returned ${analysis.status}.`);
    }

    const data = await analysis.json();

    if (!Array.isArray(data.competitors) || !data.market || data.analytics || data.probability || data.projectedMarket) {
      throw new Error("Frontend proxy returned an unexpected API shape.");
    }

    console.log("Full dev stack verification passed.");
  } catch (error) {
    const logs = output.trim();

    if (logs) {
      throw new Error(`${error.message}\n\nDev stack output:\n${logs}`);
    }

    throw error;
  } finally {
    if (app.connected) {
      app.send("shutdown");
    }

    await delay(750);

    if (!app.killed) {
      app.kill();
    }
  }

  if (/EADDRINUSE|SyntaxError|Error/i.test(output)) {
    throw new Error(output.trim());
  }
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" });

      if (response.ok) {
        return;
      }
    } catch {
      await delay(500);
    }
  }

  throw new Error(`Timed out waiting for ${url}.`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
