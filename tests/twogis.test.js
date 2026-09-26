const test = require("node:test");
const assert = require("node:assert/strict");

test("2GIS discovery caches a 5x5 search, coalesces repeat requests, and paginates on demand", async () => {
  process.env.NODE_ENV = "test";
  process.env.TWOGIS_API_KEY = "unit-test-key";
  process.env.TWOGIS_PAGE_SIZE = "50";
  process.env.TWOGIS_MAX_RESULTS = "0";
  process.env.TWOGIS_TILE_GRID_SIZE = "5";
  process.env.TWOGIS_ENABLE_TILING = "true";
  process.env.TWOGIS_REQUEST_GAP_MS = "1100";
  delete process.env.DATABASE_URL;

  let requests = 0;
  const pageSizes = [];
  global.fetch = async (input) => {
    requests += 1;
    const url = new URL(input);
    const pageSize = Number(url.searchParams.get("page_size"));
    const page = Number(url.searchParams.get("page"));
    pageSizes.push(pageSize);
    if (pageSize > 10) {
      return { ok: false, status: 403, json: async () => ({ meta: { code: 403, error: { message: "page_size restricted" } } }) };
    }
    const [lng, lat] = url.searchParams.get("point").split(",").map(Number);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        meta: { code: 200 },
        result: {
          items: [{
            id: `${lat.toFixed(5)}-${lng.toFixed(5)}-${page}`,
            name: "Aktau Learning Center",
            point: { lat, lon: lng },
            reviews: { general_rating: 4.4, general_review_count: 12 },
            rubrics: [{ name: "Education" }]
          }],
          total: 11
        }
      })
    };
  };

  const center = { lat: 43.6353, lng: 51.1682 };
  const query = { query: "education", center, radiusKm: 10, tileGridSize: 5, branchOnly: true, minRating: 3.5 };
  const firstModulePath = require.resolve("../services/twogis");
  delete require.cache[firstModulePath];
  let { search2GISBusinesses } = require("../services/twogis");

  const [first, duplicate] = await Promise.all([search2GISBusinesses(query), search2GISBusinesses(query)]);
  assert.equal(first.items.length, 25);
  assert.equal(first.hasMore, true);
  assert.equal(first.status, "ok");
  assert.equal(requests, 26, "a 5x5 search requests only one page per tile, with one demo-key fallback");
  assert.equal(pageSizes[0], 50);
  assert.equal(pageSizes[1], 10);
  assert.ok(pageSizes.slice(2).every((size) => size === 10));
  assert.equal(duplicate.cache, "shared");

  delete require.cache[firstModulePath];
  ({ search2GISBusinesses } = require("../services/twogis"));
  const afterModuleRestart = await search2GISBusinesses({ ...query, center: { lat: 43.63531, lng: 51.16819 } });
  assert.equal(afterModuleRestart.cache, "persistent-hit");
  assert.equal(afterModuleRestart.items.length, 25);
  assert.equal(requests, 26, "the cache adapter avoids fresh provider requests after the 2GIS module is reloaded");

  const nextPage = await search2GISBusinesses({ ...query, page: 2 });
  assert.equal(nextPage.page, 2);
  assert.equal(nextPage.items.length, 25);
  assert.equal(requests, 51, "the requested page uses one request per tile, with one 50-to-10 page-size fallback after restart");

  const beforeQueuedAbort = requests;
  const queuedController = new AbortController();
  const abortTimer = setTimeout(() => queuedController.abort(), 5);
  await assert.rejects(search2GISBusinesses({ ...query, query: "cancel while throttled", signal: queuedController.signal }), { name: "AbortError" });
  clearTimeout(abortTimer);
  assert.equal(requests, beforeQueuedAbort, "cancelling during the provider throttle does not spend another request");

  const beforeAbort = requests;
  const controller = new AbortController();
  await assert.rejects(search2GISBusinesses({ ...query, query: "cancelled search", signal: controller.signal, onBatch: () => controller.abort() }), { name: "AbortError" });
  assert.equal(requests, beforeAbort + 1, "cancelling a search stops the remaining tile requests");
});

test("2GIS does not retry an unrelated authorization error with another paid request", async () => {
  process.env.NODE_ENV = "test";
  process.env.TWOGIS_API_KEY = "unit-test-key";
  process.env.TWOGIS_PAGE_SIZE = "50";
  delete process.env.DATABASE_URL;

  let requests = 0;
  global.fetch = async () => {
    requests += 1;
    return {
      ok: false,
      status: 403,
      json: async () => ({ meta: { code: 403, error: { message: "The API key is not authorized" } } })
    };
  };

  const modulePath = require.resolve("../services/twogis");
  delete require.cache[modulePath];
  const { search2GISBusinesses } = require("../services/twogis");
  const result = await search2GISBusinesses({
    query: "unauthorized request",
    center: { lat: 43.6353, lng: 51.1682 },
    radiusKm: 10,
    tileGridSize: 1
  });

  assert.equal(result.status, "failed");
  assert.equal(requests, 1, "authorization failures are not retried with a second page_size request");
});
