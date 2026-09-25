const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildBestAreaAnalysis, discoverAnalysisAreas } = require("../services/areaFinder");
const { buildAnalyticsContext } = require("../services/ai/analyticsContext");

function analysisFixture(overrides = {}) {
  const base = {
    input: { city: "Aktau", country: "Kazakhstan", businessType: "coffee_shop", budget: 15000000 },
    profile: { title: "Coffee shop" },
    competitors: [
      { id: "c1", name: "Observed one", area: "17th microdistrict", coordinates: { lat: 43.6532, lng: 51.1975 }, sourceName: "2GIS" },
      { id: "c2", name: "Observed two", area: "12th microdistrict", coordinates: { lat: 43.669, lng: 51.18 }, sourceName: "OpenStreetMap" },
      { id: "c3", name: "Observed three", area: "12th microdistrict", coordinates: { lat: 43.6695, lng: 51.1805 }, sourceName: "2GIS" }
    ],
    opportunityAreas: [
      { id: "a1", name: "17th microdistrict", coordinates: { lat: 43.6532, lng: 51.1975 }, score: 78, nearbyCompetitors: 99, source: "2GIS" },
      { id: "a2", name: "12th microdistrict", coordinates: { lat: 43.669, lng: 51.18 }, score: 72, nearbyCompetitors: 99, source: "OpenStreetMap" },
      { id: "a3", name: "8th microdistrict", coordinates: { lat: 43.642, lng: 51.171 }, score: 68, nearbyCompetitors: 99, source: "2GIS" }
    ],
    market: { competitorCount: 3, map: { center: { lat: 43.6532, lng: 51.1975 } } },
    opportunityScore: { score: 74 },
    budgetPlan: { budgetRealismScore: 75, minimumViableBudget: 9000000, budgetShortfall: 0, isBelowMinimum: false },
    plannedBusinesses: [],
    propertyMarketplace: { source: "no_verified_properties", properties: [] },
    sources: {
      businesses: {
        twoGis: { name: "2GIS", status: "ready", count: 2, fetchedAt: "2026-09-01T00:00:00.000Z" },
        osm: { name: "OpenStreetMap", status: "ready", count: 1, fetchedAt: "2026-09-01T00:00:00.000Z" }
      }
    },
    meta: { generatedAt: "2026-09-01T00:00:00.000Z" }
  };
  return { ...base, ...overrides };
}

test("normalizes named sub-city areas across multiple supported cities", () => {
  const aktau = discoverAnalysisAreas({ analysis: analysisFixture() });
  assert.equal(aktau.source, "OBSERVED_NAMED_AREAS");
  assert.equal(aktau.areas[0].type, "MICRODISTRICT");

  const astana = discoverAnalysisAreas({ analysis: analysisFixture({
    input: { city: "Astana", country: "Kazakhstan", businessType: "gym", budget: 30000000 },
    opportunityAreas: [
      { name: "Yesil district", coordinates: { lat: 51.12, lng: 71.42 }, score: 70 },
      { name: "Астана", coordinates: { lat: 51.16, lng: 71.45 }, score: 90 }
    ]
  }) });
  assert.equal(astana.city.id, "astana");
  assert.equal(astana.city.countryCode, "KZ");
  assert.equal(astana.areas[0].type, "DISTRICT");
  assert.equal(astana.areas.length, 1);

  const almaty = discoverAnalysisAreas({ analysis: analysisFixture({
    input: { city: "Almaty", country: "Kazakhstan", businessType: "pharmacy", budget: 18000000 },
    opportunityAreas: [{ name: "Almaly neighborhood", coordinates: { lat: 43.25, lng: 76.92 }, score: 66 }]
  }) });
  assert.equal(almaty.areas[0].type, "NEIGHBORHOOD");
});

test("uses clearly labeled coordinate zones when neighborhood boundaries are unavailable", () => {
  const analysis = analysisFixture({ opportunityAreas: [] });
  const discovery = discoverAnalysisAreas({ analysis });
  assert.equal(discovery.source, "GENERATED_ANALYSIS_ZONES");
  assert.equal(discovery.usedGeneratedZones, true);
  assert.ok(discovery.areas.every((area) => area.type === "CUSTOM_ZONE" && /^Analysis zone \d+$/.test(area.name)));
});

test("returns insufficient state instead of fabricated districts or scores", () => {
  const result = buildBestAreaAnalysis({ analysis: analysisFixture({ competitors: [], opportunityAreas: [], sources: { businesses: {} } }) });
  assert.equal(result.status, "INSUFFICIENT_AREA_DATA");
  assert.deepEqual(result.rankedAreas, []);
  assert.deepEqual(result.analyzedAreas, []);
});

test("keeps missing evidence as null and ignores raw unequal-area competitor totals", () => {
  const result = buildBestAreaAnalysis({ analysis: analysisFixture() });
  const first = result.analyzedAreas.find((area) => area.name === "17th microdistrict");
  assert.equal(first.competition.nearbyCompetitors, 1);
  const full = result.rankedAreas.find((area) => area.name === "17th microdistrict");
  assert.equal(full.factors.demographicFit, null);
  assert.equal(full.factors.propertyFit, null);
  assert.ok(full.missingData.includes("DEMOGRAPHICS"));
  assert.ok(full.missingData.includes("COMMERCIAL_PROPERTIES"));
});

test("low budget caps every area score and exposes the viability state", () => {
  const result = buildBestAreaAnalysis({ analysis: analysisFixture({
    input: { city: "Aktau", country: "Kazakhstan", businessType: "coffee_shop", budget: 1000000 },
    opportunityScore: { score: 18 },
    budgetPlan: { budgetRealismScore: 12, minimumViableBudget: 9000000, budgetShortfall: 8000000, isBelowMinimum: true }
  }) });
  assert.equal(result.status, "BUDGET_NOT_VIABLE");
  assert.ok(result.rankedAreas.every((area) => area.score <= 18));
  assert.ok(result.rankedAreas.every((area) => area.risks.some((risk) => risk.code === "BUDGET_NOT_VIABLE")));
});

test("planned same-category businesses increase future pressure and lower the deterministic score", () => {
  const baseline = buildBestAreaAnalysis({ analysis: analysisFixture() });
  const projected = buildBestAreaAnalysis({ analysis: analysisFixture({
    plannedBusinesses: [
      { id: "p1", status: "PLANNED", category: "coffee_shop", coordinates: { lat: 43.6533, lng: 51.1976 } },
      { id: "p2", status: "VERIFIED", category: "coffee_shop", coordinates: { lat: 43.6534, lng: 51.1977 } },
      { id: "p3", status: "PLANNED", category: "pharmacy", coordinates: { lat: 43.6535, lng: 51.1978 } }
    ]
  }) });
  const before = baseline.rankedAreas.find((area) => area.name === "17th microdistrict");
  const after = projected.rankedAreas.find((area) => area.name === "17th microdistrict");
  assert.ok(after.factors.futureMarketPressure.score > before.factors.futureMarketPressure.score);
  assert.ok(after.score < before.score);
  assert.equal(after.factors.futureMarketPressure.plannedCompetitors, 2);
});

test("scores stay finite, bounded, deterministic, and Gemini receives calculated area context", () => {
  const first = buildBestAreaAnalysis({ analysis: analysisFixture() });
  const second = buildBestAreaAnalysis({ analysis: analysisFixture() });
  assert.deepEqual(first.rankedAreas.map(({ name, score, resultType }) => ({ name, score, resultType })), second.rankedAreas.map(({ name, score, resultType }) => ({ name, score, resultType })));
  assert.ok(first.analyzedAreas.every((area) => Number.isFinite(area.score) && area.score >= 0 && area.score <= 100));
  const context = buildAnalyticsContext({ ...analysisFixture(), bestAreaFinder: first });
  assert.equal(context.structuredAiContext.bestAreaFinder.rankedAreas[0].score, first.rankedAreas[0].score);
  assert.equal(context.structuredAiContext.district, first.rankedAreas[0].name);
});
