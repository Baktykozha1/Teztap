function normalizeChatPayload(body = {}) {
  const messages = Array.isArray(body.messages)
    ? body.messages
    : body.message
      ? [{ role: "user", content: body.message }]
      : [];

  const analysis = body.analysis || null;
  const requestContext = buildChatRequestContext({
    message: body.message || null,
    userContext: body.userContext || null,
    selectedDistrict: body.selectedDistrict || null,
    businessType: body.businessType || analysis?.input?.businessType || null,
    budget: body.budget || analysis?.input?.budget || null,
    discoveryContext: body.discoveryContext || null,
    analysis
  });

  return {
    messages,
    analysis,
    requestContext,
    language: body.language || requestContext.userContext?.language || "en",
    analysisId: body.analysisId || null
  };
}

function buildChatRequestContext({ message, userContext, selectedDistrict, businessType, budget, discoveryContext, analysis }) {
  return {
    message: message || null,
    userContext: userContext || null,
    selectedDistrict: selectedDistrict || null,
    businessType: businessType || null,
    budget: Number.isFinite(Number(budget)) ? Number(budget) : null,
    analysisInput: analysis?.input || null,
    discoveryContext: sanitizeDiscoveryContext(discoveryContext),
    rule: "Request context can guide interpretation, but only calculated analytics can supply business metrics. Respect each directory record's source and demo flag; unknown price or availability must remain unknown."
  };
}

function sanitizeDiscoveryContext(context) {
  if (!context || typeof context !== "object") return null;
  const categories = new Set(["education", "jobs", "services", "marketplace", "places", "all"]);
  const coordinate = (value, max) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= max ? Number(value) : null;
  const text = (value, max) => typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, " ").slice(0, max) : null;
  const center = context.center && typeof context.center === "object" ? { lat: coordinate(context.center.lat, 90), lng: coordinate(context.center.lng, 180) } : null;
  const factors = new Set(["rating", "popularity", "distance", "category"]);
  const records = Array.isArray(context.records) ? context.records.slice(0, 8).map((item) => ({
    id: text(item?.id, 80),
    category: categories.has(item?.category) ? item.category : null,
    title: text(item?.title, 160),
    description: text(item?.description, 300),
    district: text(item?.district, 120),
    address: text(item?.address, 200),
    distanceKm: coordinate(item?.distanceKm, 10000),
    priceAmount: coordinate(item?.priceAmount, 1e9),
    priceLabel: text(item?.priceLabel, 80),
    currency: item?.currency === "KZT" ? "KZT" : null,
    rating: coordinate(item?.rating, 5),
    ratingCount: coordinate(item?.ratingCount, 1e7),
    recommendationScore: coordinate(item?.recommendationScore, 100),
    topRank: coordinate(item?.topRank, 8),
    source: ["2gis", "openstreetmap", "demo", "user_generated", "organization", "public_dataset"].includes(item?.source) ? item.source : null,
    sourceLabel: text(item?.sourceLabel, 120),
    factors: Array.isArray(item?.factors) ? item.factors.slice(0, 4).filter((factor) => factors.has(factor?.key)).map((factor) => ({ key: factor.key, score: coordinate(factor.score, 100), maxScore: coordinate(factor.maxScore, 100) })) : [],
    education: item?.category === "education" && item.education && typeof item.education === "object" ? {
      subjects: Array.isArray(item.education.subjects) ? item.education.subjects.slice(0, 12).map((value) => text(value, 80)).filter(Boolean) : [],
      qualifications: text(item.education.qualifications, 240),
      experienceYears: coordinate(item.education.experienceYears, 80),
      format: text(item.education.format, 40),
      lessonType: text(item.education.lessonType, 40),
      schedule: Array.isArray(item.education.schedule) ? item.education.schedule.slice(0, 12).map((slot) => ({ day: coordinate(slot?.day, 6), from: text(slot?.from, 10), to: text(slot?.to, 10) })) : [],
      availabilityNote: text(item.education.availabilityNote, 160)
    } : null,
    job: item?.category === "jobs" && item.job && typeof item.job === "object" ? {
      employer: text(item.job.employer?.name, 120),
      salaryMin: coordinate(item.job.salaryMin, 1e9),
      salaryMax: coordinate(item.job.salaryMax, 1e9),
      employmentType: text(item.job.employmentType, 40),
      workFormat: text(item.job.workFormat, 40),
      schedule: text(item.job.schedule, 160),
      requirements: Array.isArray(item.job.requirements) ? item.job.requirements.slice(0, 12).map((value) => text(value, 100)).filter(Boolean) : [],
      requiredSkills: Array.isArray(item.job.requiredSkills) ? item.job.requiredSkills.slice(0, 12).map((value) => text(value, 80)).filter(Boolean) : []
    } : null,
    jobMatch: item?.category === "jobs" && item.jobMatch && typeof item.jobMatch === "object" ? {
      score: coordinate(item.jobMatch.score, 100),
      matchedSkills: Array.isArray(item.jobMatch.matchedSkills) ? item.jobMatch.matchedSkills.slice(0, 12).map((value) => text(value, 80)).filter(Boolean) : [],
      missingSkills: Array.isArray(item.jobMatch.missingSkills) ? item.jobMatch.missingSkills.slice(0, 12).map((value) => text(value, 80)).filter(Boolean) : []
    } : null,
    service: item?.category === "services" && item.service && typeof item.service === "object" ? {
      category: text(item.service.category, 100),
      priceFrom: coordinate(item.service.priceFrom, 1e9),
      availableDate: text(item.service.availableDate, 20),
      availableTime: text(item.service.availableTime, 20),
      urgentToday: item.service.urgentToday === true,
      serviceArea: Array.isArray(item.service.serviceArea) ? item.service.serviceArea.slice(0, 8).map((value) => text(value, 100)).filter(Boolean) : []
    } : null,
    marketplace: item?.category === "marketplace" && item.marketplace && typeof item.marketplace === "object" ? {
      category: text(item.marketplace.category, 80),
      condition: text(item.marketplace.condition, 50),
      transactionType: text(item.marketplace.transactionType, 30),
      area: text(item.marketplace.area, 100),
      sellerRating: coordinate(item.marketplace.sellerRating, 5)
    } : null,
    place: item?.category === "places" && item.place && typeof item.place === "object" ? {
      category: text(item.place.category || item.place.rubric, 100),
      openingHours: text(item.openingHours || item.place.openingHours, 180),
      priceLevel: coordinate(item.place.priceLevel, 4),
      averageBill: coordinate(item.place.averageBill, 1e7),
      bookingAvailable: item.place.bookingAvailable === true
    } : null,
    availabilityStatus: ["available", "unavailable", "sold", "cancelled", "inactive", "closed", "unknown"].includes(item?.availabilityStatus) ? item.availabilityStatus : "unknown",
    available: typeof item?.available === "boolean" ? item.available : null,
    demo: item?.demo === true
  })).filter((item) => item.id && item.title && item.category) : [];

  const rawFilters = context.filters && typeof context.filters === "object" ? context.filters : {};
  const filters = {
    query: text(rawFilters.query, 160),
    type: text(rawFilters.type, 80),
    education: rawFilters.education && typeof rawFilters.education === "object" ? {
      subject: text(rawFilters.education.subject, 80), format: text(rawFilters.education.format, 40),
      lessonType: text(rawFilters.education.lessonType, 40), maxPrice: coordinate(rawFilters.education.maxPrice, 1e9),
      minRating: coordinate(rawFilters.education.minRating, 5), date: text(rawFilters.education.date, 20), time: text(rawFilters.education.time, 10)
    } : null,
    jobs: rawFilters.jobs && typeof rawFilters.jobs === "object" ? {
      minSalary: coordinate(rawFilters.jobs.minSalary, 1e9), maxSalary: coordinate(rawFilters.jobs.maxSalary, 1e9),
      employmentType: text(rawFilters.jobs.employmentType, 40), experience: text(rawFilters.jobs.experience, 40),
      schedule: text(rawFilters.jobs.schedule, 100), workFormat: text(rawFilters.jobs.workFormat, 40)
    } : null,
    services: rawFilters.services && typeof rawFilters.services === "object" ? {
      maxPrice: coordinate(rawFilters.services.maxPrice, 1e9), minRating: coordinate(rawFilters.services.minRating, 5),
      date: text(rawFilters.services.date, 20), time: text(rawFilters.services.time, 10), urgent: rawFilters.services.urgent === true
    } : null,
    marketplace: rawFilters.marketplace && typeof rawFilters.marketplace === "object" ? {
      category: text(rawFilters.marketplace.category, 80), minPrice: coordinate(rawFilters.marketplace.minPrice, 1e9),
      maxPrice: coordinate(rawFilters.marketplace.maxPrice, 1e9), condition: text(rawFilters.marketplace.condition, 50)
    } : null,
    places: rawFilters.places && typeof rawFilters.places === "object" ? {
      maxPriceLevel: coordinate(rawFilters.places.maxPriceLevel, 4), minRating: coordinate(rawFilters.places.minRating, 5),
      openAt: text(rawFilters.places.openAt, 10), openNow: rawFilters.places.openNow === true,
      bookingOnly: rawFilters.places.bookingOnly === true
    } : null
  };

  return {
    request: text(context.request, 500),
    category: categories.has(context.category) ? context.category : "all",
    center: center?.lat != null && center?.lng != null ? center : null,
    radiusKm: coordinate(context.radiusKm, 100),
    filters,
    records
  };
}

module.exports = {
  normalizeChatPayload,
  buildChatRequestContext
};
