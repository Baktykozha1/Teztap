const { listVerifiedPriceObservations } = require("./priceObservations");

async function buildStructuredPrices({ city, businessType }) {
  const observations = await listVerifiedPriceObservations({ city, businessType });
  const records = observations.map((observation) => ({
    productName: observation.productName,
    price: observation.price,
    businessName: observation.businessName,
    area: observation.area,
    category: observation.category || businessType,
    sourceName: observation.sourceName,
    sourceUrl: observation.sourceUrl,
    sourceUpdatedAt: observation.sourceUpdatedAt || observation.verifiedAt,
    confidence: "verified-price-observation",
    evidenceType: observation.evidenceType,
    verifiedAt: observation.verifiedAt
  }));

  return {
    records,
    sourceSummary: {
      verifiedPriceObservations: records.length,
      verifiedLocalRecords: records.length,
      scrapedRecords: 0,
      totalRecords: records.length,
      source: "verified_price_observations"
    }
  };
}

function hasEvidenceSource(record) {
  return Boolean(record.sourceUrl && record.sourceName && record.confidence);
}

function parseJsonLdPrices({ html, competitor }) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  return scripts.flatMap((match) => {
    try {
      const parsed = JSON.parse(stripHtml(match[1]));
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      return nodes.flatMap((node) => extractJsonLdNode({ node, competitor }));
    } catch {
      return [];
    }
  });
}

function extractJsonLdNode({ node, competitor }) {
  if (!node || typeof node !== "object") {
    return [];
  }

  const children = [
    ...(Array.isArray(node["@graph"]) ? node["@graph"] : []),
    ...(Array.isArray(node.hasMenuSection) ? node.hasMenuSection : []),
    ...(Array.isArray(node.hasMenuItem) ? node.hasMenuItem : []),
    ...(Array.isArray(node.offers) ? node.offers : [])
  ];
  const currentRecord = createRecordFromJsonLd({ node, competitor });

  return [
    ...(currentRecord ? [currentRecord] : []),
    ...children.flatMap((child) => extractJsonLdNode({ node: child, competitor }))
  ];
}

function createRecordFromJsonLd({ node, competitor }) {
  const productName = node.name || node.itemOffered?.name;
  const price = Number(node.price || node.offers?.price);

  if (!productName || !Number.isFinite(price)) {
    return null;
  }

  return {
    productName,
    price,
    businessName: competitor.name,
    area: competitor.area,
    category: node["@type"] || "menu item",
    sourceName: competitor.sourceName,
    sourceUrl: competitor.sourceUrl,
    sourceUpdatedAt: competitor.sourceUpdatedAt,
    confidence: "parsed-json-ld"
  };
}

function parseVisiblePricePairs({ html, competitor }) {
  const text = stripHtml(html)
    .replace(/\s+/g, " ")
    .slice(0, 120000);
  const pattern = /([A-Za-zА-Яа-яЁёӘәІіҢңҒғҮүҰұҚқӨөҺһ0-9][A-Za-zА-Яа-яЁёӘәІіҢңҒғҮүҰұҚқӨөҺһ0-9\s.,'"()/-]{2,54}?)\s*(?:→|-|:)?\s*([1-9][0-9\s]{2,6})\s*(?:₸|KZT|тг|тенге)/gi;
  const records = [];
  let match;

  while ((match = pattern.exec(text)) && records.length < 40) {
    const productName = cleanupProductName(match[1]);
    const price = Number(match[2].replace(/\s/g, ""));

    if (productName && Number.isFinite(price)) {
      records.push({
        productName,
        price,
        businessName: competitor.name,
        area: competitor.area,
        category: "parsed public price",
        sourceName: competitor.sourceName,
        sourceUrl: competitor.sourceUrl,
        sourceUpdatedAt: competitor.sourceUpdatedAt,
        confidence: "parsed-visible-text"
      });
    }
  }

  return records;
}

function cleanupProductName(value) {
  const name = String(value || "")
    .replace(/[^\p{L}\p{N}\s.,'"()/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (name.length < 3 || /^\d+$/.test(name)) {
    return "";
  }

  return name;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script(?![^>]+application\/ld\+json)[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function dedupePriceRecords(records) {
  const seen = new Set();

  return records.filter((record) => {
    if (!isValidPriceRecord(record) || !hasEvidenceSource(record)) {
      return false;
    }

    const key = `${record.businessName}|${record.area}|${record.productName}|${record.price}`.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isValidPriceRecord(record) {
  return Boolean(
    record &&
      record.productName &&
      Number.isFinite(Number(record.price)) &&
      record.price > 0 &&
      record.businessName &&
      record.area
  );
}

module.exports = {
  buildStructuredPrices
};
