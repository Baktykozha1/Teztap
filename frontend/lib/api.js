import {
  API_ANALYZE_URL,
  API_CHAT_STREAM_URL,
  API_CHAT_URL,
  API_EXPORT_URL,
  API_HEALTH_URL,
  API_OPTIONS_URL,
  fallbackOptions
} from "./constants";

export function authHeaders(session) {
  return session?.token ? { Authorization: `Bearer ${session.token}` } : {};
}

export async function loadSystemState() {
  const [healthResponse, optionsResponse] = await Promise.all([
    fetch(API_HEALTH_URL, { cache: "no-store" }),
    fetch(API_OPTIONS_URL, { cache: "no-store" })
  ]);

  if (!healthResponse.ok || !optionsResponse.ok) {
    throw new Error("API is not ready");
  }

  const [healthData, optionData] = await Promise.all([healthResponse.json(), optionsResponse.json()]);

  return {
    database: healthData.database,
    options: {
      cities: optionData.cities?.length ? optionData.cities : fallbackOptions.cities,
      businessTypes: optionData.businessTypes?.length ? optionData.businessTypes : fallbackOptions.businessTypes,
      profiles: optionData.profiles || {},
      dataVersion: optionData.dataVersion || fallbackOptions.dataVersion
    }
  };
}

export async function requestAnalysis({ form, session, signal }) {
  const response = await fetch(API_ANALYZE_URL, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(session)
    },
    body: JSON.stringify({
      city: form.city,
      budget: Number(form.budget),
      businessType: form.businessType,
      country: form.country || "Kazakhstan",
      preferredLocation: form.preferredLocation || null,
      targetAudience: form.targetAudience || null,
      businessFormat: form.businessFormat || null
    })
  });

  if (!response.ok) {
    throw await createApiError(response, "Analysis request failed");
  }

  return response.json();
}

export async function requestBestAreas({ form, session, signal }) {
  const response = await fetch("/api/area-analysis/best", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(session)
    },
    body: JSON.stringify({
      country: form.country,
      city: form.city,
      businessType: form.businessType,
      budget: Number(form.budget),
      targetAudience: form.targetAudience || null,
      businessFormat: form.businessFormat || null
    })
  });

  if (!response.ok) {
    throw await createApiError(response, "Best area analysis failed");
  }

  return response.json();
}

export async function submitAuthRequest({ mode, authForm }) {
  const response = await fetch(`/api/auth/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(authForm)
  });

  if (!response.ok) {
    throw await createApiError(response, "Authentication failed");
  }

  return response.json();
}

export async function loadSavedAnalyses(token) {
  const response = await fetch("/api/analyses", {
    headers: authHeaders({ token }),
    cache: "no-store"
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.analyses || [];
}

export async function loadPlannedBusinesses({ city, category, mine = false, session }) {
  const params = new URLSearchParams();
  if (city) params.set("city", city);
  if (category) params.set("category", category);
  if (mine) params.set("mine", "true");

  const response = await fetch(`/api/planned-businesses?${params.toString()}`, {
    headers: authHeaders(session),
    cache: "no-store"
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.plannedBusinesses || [];
}

export async function createPlannedBusiness({ plan, session }) {
  const response = await fetch("/api/planned-businesses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(session)
    },
    body: JSON.stringify(plan)
  });

  if (!response.ok) {
    throw await createApiError(response, "Could not add planned business");
  }

  return response.json();
}

export async function updatePlannedBusiness({ id, updates, session }) {
  const response = await fetch(`/api/planned-businesses/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(session)
    },
    body: JSON.stringify(updates)
  });

  if (!response.ok) {
    throw await createApiError(response, "Could not update planned business");
  }

  return response.json();
}

export async function cancelPlannedBusiness({ id, session }) {
  const response = await fetch(`/api/planned-businesses/${id}`, {
    method: "DELETE",
    headers: authHeaders(session)
  });

  if (!response.ok) {
    throw await createApiError(response, "Could not cancel planned business");
  }

  return response.json();
}

export async function loadProperties({ city, transactionType, propertyType, districtId, mine = false, session } = {}) {
  const params = new URLSearchParams();
  if (city) params.set("city", city);
  if (transactionType) params.set("transactionType", transactionType);
  if (propertyType) params.set("propertyType", propertyType);
  if (districtId) params.set("districtId", districtId);
  if (mine) params.set("mine", "true");
  const response = await fetch(`/api/properties?${params.toString()}`, { headers: authHeaders(session), cache: "no-store" });
  if (!response.ok) return [];
  const data = await response.json();
  return data.properties || [];
}

export async function loadPropertyRecommendations({ analysis, filters = {} }) {
  const response = await fetch("/api/properties/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis, filters })
  });
  if (!response.ok) return { properties: [], assumptions: [], source: "request_failed" };
  return response.json();
}

export async function submitProperty({ property, session }) {
  const response = await fetch("/api/properties", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(session) },
    body: JSON.stringify(property)
  });
  if (!response.ok) throw await createApiError(response, "Could not submit property");
  return response.json();
}

export function streamChatRequest({ messages, analysis, analysisId, language, session, selectedDistrict = null, discoveryContext = null }) {
  return fetch(API_CHAT_STREAM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(session)
    },
    body: JSON.stringify({ messages, analysis, analysisId, language, selectedDistrict, discoveryContext })
  });
}

export async function fallbackChatRequest({ messages, analysis, analysisId, language, session }) {
  const response = await fetch(API_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(session)
    },
    body: JSON.stringify({ messages, analysis, analysisId, language })
  });

  if (!response.ok) {
    throw await createApiError(response, "Chat request failed");
  }

  return response.json();
}

export async function buildExportReport({ result, language }) {
  const response = await fetch(API_EXPORT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis: result, language })
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

export async function buildExportHtmlReport({ result, language }) {
  const response = await fetch("/api/export/report/html", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis: result, language })
  });

  if (!response.ok) {
    return "";
  }

  return response.text();
}

async function createApiError(response, fallbackMessage) {
  const details = await response.json().catch(() => null);
  const error = new Error(details?.error || fallbackMessage);
  error.status = response.status;
  error.isApiResponse = true;
  return error;
}
