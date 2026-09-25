const { listSupportedCities } = require("./cities");

const dataVersion = "live-sources";

const businessProfiles = {
  grocery: {
    title: "Grocery store",
    priceUnit: "KZT per basket",
    priceLabels: ["Basic basket", "Average basket", "Expanded basket"],
    priceMeaning:
      "Businesses are loaded from live map sources. Basket prices appear only when verified public price evidence is available.",
    monthlyFixedCostRate: 0.12,
    launchReserveRate: 0.22,
    targetMargin: 0.18,
    monthlyTransactions: 1400,
    minimumViableBudget: 15000000
  },
  cafe: {
    title: "Cafe / fast food",
    priceUnit: "KZT per menu item",
    priceLabels: ["Affordable item", "Mid item", "Premium item"],
    priceMeaning:
      "Cafe locations are loaded from live map sources. Menu prices appear only when a public source can be verified.",
    monthlyFixedCostRate: 0.16,
    launchReserveRate: 0.28,
    targetMargin: 0.24,
    monthlyTransactions: 900,
    minimumViableBudget: 6000000
  },
  coffee_shop: {
    title: "Coffee shop",
    priceUnit: "KZT per drink/menu item",
    priceLabels: ["Cappuccino", "Latte", "Dessert"],
    priceMeaning:
      "Businesses are loaded from live map sources. Prices appear only when a public menu or catalog provides product-level evidence.",
    monthlyFixedCostRate: 0.15,
    launchReserveRate: 0.26,
    targetMargin: 0.28,
    monthlyTransactions: 1100,
    minimumViableBudget: 8000000
  },
  bubble_tea: {
    title: "Bubble tea",
    priceUnit: "KZT per drink/menu item",
    priceLabels: ["Milk tea", "Fruit tea", "Special drink"],
    priceMeaning: "Pricing remains empty until public product-level evidence is available.",
    monthlyFixedCostRate: 0.14,
    launchReserveRate: 0.24,
    targetMargin: 0.32,
    monthlyTransactions: 950,
    minimumViableBudget: 4000000
  },
  pharmacy: {
    title: "Pharmacy",
    priceUnit: "KZT per product",
    priceLabels: ["Medicine", "Care product", "Supplement"],
    priceMeaning:
      "Pharmacy locations are loaded from OpenStreetMap. Product prices must come from public pharmacy catalog/menu pages and are shown only with product names.",
    monthlyFixedCostRate: 0.13,
    launchReserveRate: 0.3,
    targetMargin: 0.22,
    monthlyTransactions: 1600,
    minimumViableBudget: 12000000
  },
  restaurant: {
    title: "Restaurant",
    priceUnit: "KZT per menu item",
    priceLabels: ["Main dish", "Set menu", "Premium dish"],
    priceMeaning: "Restaurant locations come from live map sources. Menu prices are shown only when verified public samples are available.",
    monthlyFixedCostRate: 0.2,
    launchReserveRate: 0.32,
    targetMargin: 0.24,
    monthlyTransactions: 720,
    minimumViableBudget: 18000000
  },
  bakery: {
    title: "Bakery",
    priceUnit: "KZT per item",
    priceLabels: ["Pastry", "Bread", "Dessert"],
    priceMeaning: "Bakery prices require verified product-level samples and are not inferred from competitor counts.",
    monthlyFixedCostRate: 0.15,
    launchReserveRate: 0.24,
    targetMargin: 0.3,
    monthlyTransactions: 1300,
    minimumViableBudget: 7000000
  },
  beauty_salon: {
    title: "Beauty salon",
    priceUnit: "KZT per service",
    priceLabels: ["Basic service", "Core service", "Premium service"],
    priceMeaning: "Service pricing is reported only from verified public service menus or catalog evidence.",
    monthlyFixedCostRate: 0.16,
    launchReserveRate: 0.25,
    targetMargin: 0.34,
    monthlyTransactions: 650,
    minimumViableBudget: 8000000
  },
  barbershop: {
    title: "Barbershop",
    priceUnit: "KZT per service",
    priceLabels: ["Haircut", "Beard service", "Full service"],
    priceMeaning: "Barbershop locations are map evidence; service prices require verified public menus.",
    monthlyFixedCostRate: 0.14,
    launchReserveRate: 0.23,
    targetMargin: 0.35,
    monthlyTransactions: 800,
    minimumViableBudget: 5000000
  },
  fitness: {
    title: "Fitness club",
    priceUnit: "KZT per membership/service",
    priceLabels: ["Day pass", "Monthly membership", "Premium membership"],
    priceMeaning: "Fitness pricing is kept empty until verified membership or service prices are available.",
    monthlyFixedCostRate: 0.24,
    launchReserveRate: 0.34,
    targetMargin: 0.28,
    monthlyTransactions: 900,
    minimumViableBudget: 25000000
  },
  clothing: {
    title: "Clothing store",
    priceUnit: "KZT per item",
    priceLabels: ["Entry item", "Core item", "Premium item"],
    priceMeaning: "Clothing pricing requires comparable product samples from public catalogs or stores.",
    monthlyFixedCostRate: 0.17,
    launchReserveRate: 0.28,
    targetMargin: 0.38,
    monthlyTransactions: 600,
    minimumViableBudget: 12000000
  },
  electronics: {
    title: "Electronics store",
    priceUnit: "KZT per item",
    priceLabels: ["Entry product", "Core product", "Premium product"],
    priceMeaning: "Electronics price intelligence uses verified product listings and does not infer prices from map density.",
    monthlyFixedCostRate: 0.16,
    launchReserveRate: 0.3,
    targetMargin: 0.2,
    monthlyTransactions: 450,
    minimumViableBudget: 20000000
  },
  auto_service: {
    title: "Auto service",
    priceUnit: "KZT per service",
    priceLabels: ["Basic repair", "Standard service", "Major service"],
    priceMeaning: "Auto service pricing is shown only from verified public service menus or quotes.",
    monthlyFixedCostRate: 0.19,
    launchReserveRate: 0.3,
    targetMargin: 0.3,
    monthlyTransactions: 360,
    minimumViableBudget: 14000000
  },
  childcare: {
    title: "Childcare center",
    priceUnit: "KZT per month/service",
    priceLabels: ["Part-time", "Monthly care", "Extended care"],
    priceMeaning: "Childcare pricing requires verified local service tariffs and is not generated from competitor counts.",
    monthlyFixedCostRate: 0.2,
    launchReserveRate: 0.28,
    targetMargin: 0.26,
    monthlyTransactions: 280,
    minimumViableBudget: 16000000
  },
  pet_store: {
    title: "Pet store",
    priceUnit: "KZT per item",
    priceLabels: ["Entry item", "Core basket", "Premium item"],
    priceMeaning: "Pet store prices require product-level catalog evidence from comparable local sellers.",
    monthlyFixedCostRate: 0.15,
    launchReserveRate: 0.25,
    targetMargin: 0.25,
    monthlyTransactions: 700,
    minimumViableBudget: 8000000
  },
  flowers: {
    title: "Flower shop",
    priceUnit: "KZT per arrangement",
    priceLabels: ["Small arrangement", "Core bouquet", "Premium arrangement"],
    priceMeaning: "Flower pricing is calculated only from verified comparable arrangements.",
    monthlyFixedCostRate: 0.16,
    launchReserveRate: 0.27,
    targetMargin: 0.4,
    monthlyTransactions: 420,
    minimumViableBudget: 6000000
  },
  coworking: {
    title: "Coworking space",
    priceUnit: "KZT per membership",
    priceLabels: ["Day pass", "Monthly desk", "Private office"],
    priceMeaning: "Coworking price intelligence requires verified membership and workspace tariffs.",
    monthlyFixedCostRate: 0.23,
    launchReserveRate: 0.34,
    targetMargin: 0.3,
    monthlyTransactions: 300,
    minimumViableBudget: 22000000
  }
};

function getOptions() {
  return {
    cities: listSupportedCities(),
    businessTypes: Object.keys(businessProfiles),
    profiles: businessProfiles,
    dataVersion
  };
}

function findKey(source, requestedKey) {
  const normalized = String(requestedKey || "").trim().toLowerCase();
  return Object.keys(source).find((key) => key.toLowerCase() === normalized);
}

function getBusinessProfile(businessType) {
  const typeKey = findKey(businessProfiles, businessType);
  return typeKey ? businessProfiles[typeKey] : createDefaultProfile(businessType);
}

function createDefaultProfile(businessType) {
  return {
    title: businessType || "Business",
    priceUnit: "KZT",
    priceLabels: ["Low segment", "Mid segment", "High segment"],
    priceMeaning: "Prices show the observed competitor range for this market.",
    monthlyFixedCostRate: 0.14,
    launchReserveRate: 0.25,
    targetMargin: 0.2,
    monthlyTransactions: 1000,
    minimumViableBudget: 5000000
  };
}

module.exports = {
  dataVersion,
  getOptions,
  getBusinessProfile
};
