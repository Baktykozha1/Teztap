export function formatMoney(value) {
  const number = Number(value);

  return Number.isFinite(number) ? new Intl.NumberFormat("ru-RU").format(number) : "n/a";
}

export function compactMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "n/a";
  }

  if (Math.abs(number) >= 1000000) {
    return `${Math.round(number / 100000) / 10}M`;
  }

  if (Math.abs(number) >= 1000) {
    return `${Math.round(number / 1000)}K`;
  }

  return String(number);
}

export function formatBoardMetric(metric) {
  if (metric.kind === "money") {
    return `${formatMoney(metric.value)} KZT`;
  }

  return `${formatMoney(metric.value)}${metric.suffix || ""}`;
}

export function formatBusinessType(value, profiles) {
  return profiles?.[value]?.title || String(value || "Business").replace(/_/g, " ");
}

export function formatFactorName(value) {
  const names = {
    competition: "Competition",
    pricing: "Pricing power",
    ratingGap: "Rating gap",
    underservedDemand: "Underserved demand",
    saturation: "Saturation",
    profitability: "Profitability",
    budgetRealism: "Budget realism"
  };

  return names[value] || value;
}

export function getDistrictHeat(district) {
  const score = Number(district.opportunityScore);
  const nearby = Number(district.nearbyCompetitors);
  const underserved = Number(district.underservedScore);

  if (!Number.isFinite(score) || !Number.isFinite(nearby) || !Number.isFinite(underserved)) {
    return { tone: "blue", label: "Data unavailable" };
  }

  if (district.saturation === "high" || nearby >= 4) {
    return { tone: "red", label: "Oversaturated" };
  }

  if (district.saturation === "medium" || nearby >= 2 || score < 62) {
    return { tone: "yellow", label: "Medium competition" };
  }

  if (score >= 68 || underserved >= 70) {
    return { tone: "green", label: "Opportunity zone" };
  }

  return { tone: "yellow", label: "Watchlist" };
}

export function getDensityTone(value) {
  const density = String(value || "").toLowerCase();

  if (!density) {
    return "blue";
  }

  if (density.includes("high")) {
    return "red";
  }

  if (density.includes("moderate")) {
    return "yellow";
  }

  return "green";
}

export function getSaturationTone(value) {
  const saturation = String(value || "").toLowerCase();

  if (!saturation) {
    return "blue";
  }

  if (saturation.includes("high")) {
    return "red";
  }

  if (saturation.includes("moderate") || saturation.includes("medium")) {
    return "yellow";
  }

  return "green";
}
