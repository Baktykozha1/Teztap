export const LAST_ANALYSIS_KEY = "mercora:last-analysis";

export function saveLastAnalysis(result) {
  if (typeof window === "undefined" || !result) {
    return;
  }

  window.localStorage.setItem(
    LAST_ANALYSIS_KEY,
    JSON.stringify({
      analysisId: result.analysisId || null,
      userId: result.account?.user?.id || null,
      // Authenticated results are reloaded through the server's current permissions.
      result: result.analysisId ? undefined : guestResult(result),
      savedAt: new Date().toISOString()
    })
  );
}

export async function loadLastAnalysis(user = null) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LAST_ANALYSIS_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw);
    const id = stored.analysisId || stored.result?.analysisId;
    const owner = stored.userId || stored.result?.account?.user?.id;
    if (id) {
      if (!user || (owner && owner !== user.id)) return null;
      const response = await fetch(`/api/analyses/${encodeURIComponent(id)}`, { cache: "no-store" });
      return response.ok ? { result: await response.json(), savedAt: stored.savedAt } : null;
    }
    return stored.result && !user ? { result: guestResult(stored.result), savedAt: stored.savedAt } : null;
  } catch {
    return null;
  }
}

function guestResult(result) {
  return {
    input: result.input, meta: result.meta, profile: { title: result.profile?.title },
    sources: { businesses: result.sources?.businesses, city: result.sources?.city },
    competitors: (result.competitors || []).map(({ id, name, address, area, category, coordinates, sourceName, sourceUrl }) => ({ id, name, address, area, category, coordinates, sourceName, sourceUrl })),
    market: { competitorCount: result.market?.competitorCount, areaCounts: result.market?.areaCounts, map: result.market?.map }
  };
}
