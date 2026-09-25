function validateAnalysisContract(result) {
  return collectMissingFields(result, [
    ["input", "object"],
    ["profile", "object"],
    ["competitors", "array"],
    ["prices", "array"],
    ["stats", "object"],
    ["analytics", "object"],
    ["charts", "object"],
    ["budgetPlan", "object"],
    ["recommendation", "object"],
    ["opportunityScore", "object"],
    ["probability", "object"],
    ["districtMetrics", "array"],
    ["proprietaryScoring", "object"],
    ["opportunityDiscovery", "object"],
    ["marketGapEngine", "object"],
    ["cityEconomicIndicator", "object"],
    ["investmentModule", "object"],
    ["ecosystemWorkflows", "object"],
    ["aiNarratives", "object"]
  ]);
}

function validateCompetitorSnapshotContract(snapshot) {
  return collectMissingFields(snapshot, [
    ["competitors", "array"],
    ["market", "object"],
    ["sources", "object"],
    ["generatedAt", "string"],
    ["dataVersion", "string"]
  ]);
}

function validatePriceSnapshotContract(snapshot) {
  return collectMissingFields(snapshot, [
    ["prices", "array"],
    ["stats", "object"],
    ["profile", "object"],
    ["sources", "object"],
    ["generatedAt", "string"],
    ["dataVersion", "string"]
  ]);
}

function validateReportContract(report) {
  return collectMissingFields(report, [
    ["title", "string"],
    ["state", "string"],
    ["sections", "array"],
    ["html", "string"],
    ["printHtml", "string"],
    ["filename", "string"]
  ]);
}

function collectMissingFields(source, fields) {
  return fields
    .filter(([field, type]) => !matchesType(source?.[field], type))
    .map(([field]) => field);
}

function matchesType(value, type) {
  if (type === "array") {
    return Array.isArray(value);
  }

  if (type === "object") {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  if (type === "string") {
    return typeof value === "string" && value.length > 0;
  }

  return typeof value === type;
}

module.exports = {
  validateAnalysisContract,
  validateCompetitorSnapshotContract,
  validatePriceSnapshotContract,
  validateReportContract
};
