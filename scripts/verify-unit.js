const assert = require("node:assert/strict");
const { getOptions } = require("../data/competitors");
const { getCityConfig, getCitySearchArea } = require("../data/cities");
const { validateCompetitorSnapshotContract, validatePriceSnapshotContract } = require("../services/contracts");
const { buildProjectedMarketModel, distanceKm } = require("../services/projectedMarket");
const { validatePlannedBusinessPayload } = require("../services/plannedBusinesses");
const { validatePropertyPayload, calculatePropertyFitScore } = require("../services/properties");
const { deriveObservedAreas } = require("../services/districts");
const { validatePriceObservationPayload } = require("../services/priceObservations");

const options = getOptions();

assert.ok(options.businessTypes.includes("restaurant"));
assert.ok(options.businessTypes.includes("beauty_salon"));
assert.ok(options.businessTypes.includes("coworking"));
assert.ok(options.cities.includes("Astana"));
assert.equal(getCityConfig("Нур-Султан").name, "Astana");
assert.equal(getCitySearchArea("Astana").radiusMeters, 18000);
const observedAreas = deriveObservedAreas({
  city: "Astana",
  competitors: [
    { area: "Yesil district", coordinates: { lat: 51.12, lng: 71.42 } },
    { area: "Yesil district", coordinates: { lat: 51.13, lng: 71.43 } },
    { area: "Astana", coordinates: { lat: 51.14, lng: 71.44 } }
  ]
});
assert.equal(observedAreas.length, 1);
assert.equal(observedAreas[0].name, "Yesil district");
const priceObservation = validatePriceObservationPayload({
  city: "Aktau",
  businessType: "coffee_shop",
  businessName: "Verified Cafe",
  productName: "Cappuccino",
  price: 1500,
  area: "17th microdistrict",
  sourceUrl: "https://example.com/menu",
  evidenceType: "PUBLIC_MENU"
});
assert.equal(priceObservation.evidenceType, "PUBLIC_MENU");
assert.throws(() => validatePriceObservationPayload({ ...priceObservation, sourceUrl: "not-a-url" }), /sourceUrl must be a valid public URL/);
assert.equal(validateCompetitorSnapshotContract({
  competitors: [],
  market: {},
  sources: {},
  generatedAt: new Date().toISOString(),
  dataVersion: "test"
}).length, 0);
assert.equal(validatePriceSnapshotContract({
  prices: [],
  stats: {},
  profile: {},
  sources: {},
  generatedAt: new Date().toISOString(),
  dataVersion: "test"
}).length, 0);

const plannedPayload = validatePlannedBusinessPayload({
  category: "coffee_shop",
  city: "Aktau",
  latitude: 43.6532,
  longitude: 51.1975,
  address: "17th microdistrict"
});
assert.equal(plannedPayload.status, "PLANNED");
assert.equal(plannedPayload.category, "coffee_shop");

assert.throws(() => validatePlannedBusinessPayload({
  category: "coffee_shop",
  city: "Aktau",
  latitude: 200,
  longitude: 51.1975,
  address: "Invalid coordinate"
}), /latitude must be a valid coordinate/);

const baseAnalysis = {
  input: { city: "Aktau", businessType: "coffee_shop", budget: 15000000 },
  market: { competitorCount: 12 },
  opportunityScore: { score: 82 },
  districtMetrics: [
    { district: "17th Microdistrict", opportunityScore: 82, nearbyCompetitors: 2, coordinates: { lat: 43.6532, lng: 51.1975 } },
    { district: "12th Microdistrict", opportunityScore: 79, nearbyCompetitors: 1, coordinates: { lat: 43.662, lng: 51.18 } }
  ],
  recommendation: { bestArea: "17th Microdistrict" },
  proprietaryScoring: { scores: { riskScore: 31 } }
};
const projected = buildProjectedMarketModel({
  analysis: baseAnalysis,
  plannedBusinesses: [
    { id: "p1", category: "coffee_shop", status: "PLANNED", districtId: "17th Microdistrict", coordinates: { lat: 43.6533, lng: 51.1976 } },
    { id: "p2", category: "coffee_shop", status: "VERIFIED", districtId: "17th Microdistrict", coordinates: { lat: 43.6534, lng: 51.1977 } },
    { id: "p3", category: "pharmacy", status: "PLANNED", districtId: "17th Microdistrict", coordinates: { lat: 43.6535, lng: 51.1978 } }
  ]
});
assert.equal(projected.existingCompetitors, 12);
assert.equal(projected.plannedCompetitors, 1);
assert.equal(projected.verifiedCompetitors, 1);
assert.ok(projected.futureMarketPressure > projected.currentCompetitionScore);
assert.ok(projected.projectedOpportunityScore < projected.currentOpportunityScore);
assert.ok(projected.alternativeOpportunity);
assert.ok(distanceKm({ lat: 43.6532, lng: 51.1975 }, { lat: 43.6533, lng: 51.1976 }) < 0.1);

const propertyPayload = validatePropertyPayload({
  title: "Verified street retail unit",
  propertyType: "street_retail",
  transactionType: "RENT",
  price: 500000,
  areaSqm: 90,
  city: "Aktau",
  latitude: 43.6532,
  longitude: 51.1975,
  address: "17th Microdistrict",
  source: "partner_feed",
  sourceUrl: "https://example.com/listing"
});
assert.equal(propertyPayload.status, "PENDING");
assert.equal(propertyPayload.transactionType, "RENT");
assert.throws(() => validatePropertyPayload({ ...propertyPayload, areaSqm: 0 }), /areaSqm must be greater than zero/);
const propertyScore = calculatePropertyFitScore({
  property: { ...propertyPayload, id: "p1", status: "ACTIVE", coordinates: { lat: 43.6532, lng: 51.1975 } },
  analysis: baseAnalysis
});
assert.ok(propertyScore.propertyFitScore >= 0 && propertyScore.propertyFitScore <= 100);
assert.ok(propertyScore.fitExplanation.includes("budget"));

const { categories: discoveryCategories, listings: discoveryListings } = require("../data/discovery");
const { AKTAU_CENTER, interpretDiscoveryRequest, matchesDiscoveryIntent, recommendationScore, scoreListing } = require("../frontend/lib/discovery");
const { isOpenAt } = require("../frontend/lib/place-hours");
const { normalizeChatPayload } = require("../services/ai/chatService");
assert.deepEqual(discoveryCategories.map((item) => item.key), ["education", "jobs", "services", "marketplace", "places"]);
assert.ok(discoveryListings.every((item) => item.demo === true && item.coordinates && item.rating >= 0 && item.rating <= 5));
assert.ok(discoveryListings.some((item) => item.category === "services" && item.subtype === "Plumbers"));
assert.ok(discoveryListings.some((item) => item.category === "jobs" && item.job?.requiredSkills?.length > 0));
assert.ok(discoveryListings.some((item) => item.category === "places" && item.subtype === "Entertainment"));
assert.ok(discoveryListings.some((item) => item.category === "places" && item.subtype === "Pharmacies" && item.openingHours));
assert.equal(isOpenAt("24/7", new Date("2026-09-24T16:00:00Z")), true);
assert.equal(isOpenAt("Mo-Fr 09:00-18:00; Sa-Su off", new Date("2026-09-27T08:00:00Z")), false);
assert.equal(isOpenAt("Fr 22:00-02:00", new Date("2026-09-25T20:00:00Z")), true);
assert.equal(isOpenAt("unknown", new Date("2026-09-24T16:00:00Z")), null);
const nearbyScore = scoreListing({ rating: 4.8, ratingCount: 25, categoryFit: 1, coordinates: { lat: 43.6532, lng: 51.1975 } });
const distantScore = scoreListing({ rating: 4.8, ratingCount: 25, categoryFit: 1, coordinates: { lat: 43.72, lng: 51.31 } });
assert.ok(nearbyScore.recommendationScore > distantScore.recommendationScore);
assert.ok(recommendationScore({ rating: 5, ratingCount: 10000, distance: 0, categoryFit: 1 }) <= 100);
assert.ok(recommendationScore({ rating: 0, ratingCount: 0, distance: 20, categoryFit: 0 }) >= 0);
assert.equal(nearbyScore.recommendationScore, 93, "The existing Mercora formula result must remain unchanged.");
assert.equal(distantScore.recommendationScore, 73, "The existing Mercora distance impact must remain unchanged.");
const missingEvidence = scoreListing({ rating: null, ratingCount: null, priceAmount: null, coordinates: AKTAU_CENTER });
assert.equal(missingEvidence.recommendationScore, 40);
assert.ok(missingEvidence.recommendationDisadvantages.some((item) => item.includes("Рейтинг")));
assert.ok(missingEvidence.recommendationDisadvantages.some((item) => item.includes("Цена")));
assert.equal(missingEvidence.priceAmount, null, "Unknown prices must stay unknown rather than becoming zero.");
const unavailableListing = scoreListing({ rating: 4.8, ratingCount: 25, available: false, coordinates: AKTAU_CENTER });
assert.equal(unavailableListing.eligibleForRecommendation, false);
assert.equal(unavailableListing.recommendationScore, 93, "Availability metadata must not change the legacy score formula.");
const outsideRadius = scoreListing({ rating: 4.8, ratingCount: 25, coordinates: { lat: 43.72, lng: 51.31 } }, { center: AKTAU_CENTER, radiusKm: 1 });
assert.equal(outsideRadius.withinRadius, false);
assert.equal(outsideRadius.eligibleForRecommendation, false);
assert.equal(outsideRadius.recommendationScore, 73);
const unknownLocation = scoreListing({ coordinates: { lat: null, lng: null }, rating: 4.5 }, { center: AKTAU_CENTER, radiusKm: 10 });
assert.equal(unknownLocation.distanceKm, null);
assert.equal(unknownLocation.eligibleForRecommendation, false);
const mathIntent = interpretDiscoveryRequest("Find a mathematics tutor for less than 5,000 tenge");
assert.equal(mathIntent.category, "education");
assert.equal(mathIntent.budgetAmount, 5000);
assert.equal(mathIntent.budgetInclusive, false);
assert.equal(matchesDiscoveryIntent(discoveryListings.find((item) => item.id === "edu-4"), mathIntent), false);
const lateGymIntent = interpretDiscoveryRequest("Find an affordable gym near me that is open after 10 PM");
assert.equal(lateGymIntent.category, "places");
assert.equal(lateGymIntent.requestedHourAfter, 22);
assert.equal(lateGymIntent.nearMe, true);
assert.equal(matchesDiscoveryIntent(discoveryListings.find((item) => item.id === "place-3"), lateGymIntent), true);
const districtJobIntent = interpretDiscoveryRequest("Show sales assistant vacancies near the 14th microdistrict");
assert.equal(matchesDiscoveryIntent(discoveryListings.find((item) => item.id === "job-1"), districtJobIntent), true);
const todayRepairIntent = interpretDiscoveryRequest("Find someone who can repair a washing machine today");
assert.equal(todayRepairIntent.requiresToday, true);
assert.equal(matchesDiscoveryIntent(discoveryListings.find((item) => item.id === "srv-1"), todayRepairIntent), true);
const aiHandoff = normalizeChatPayload({ discoveryContext: { request: "Find nearby help", category: "services", center: AKTAU_CENTER, radiusKm: 5, records: [{ id: "srv-1", category: "services", title: "Repair", priceAmount: null, rating: null, availabilityStatus: "unknown", factors: [{ key: "rating", score: 0, maxScore: 40 }] }] } });
assert.equal(aiHandoff.requestContext.discoveryContext.records[0].priceAmount, null);
assert.equal(aiHandoff.requestContext.discoveryContext.records[0].rating, null);
assert.equal(aiHandoff.requestContext.discoveryContext.records[0].available, null);
assert.equal(aiHandoff.requestContext.discoveryContext.records[0].demo, true);

console.log("Unit smoke checks passed.");
