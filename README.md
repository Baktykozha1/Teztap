# TezTap — городские сервисы Актау и ИИ Mercora

TezTap is a city services platform for Aktau. It brings education, jobs, nearby services, marketplace listings, places, and neighborhood communities together on a shared map. The existing Mercora analysis and recommendation engine remains TezTap's central AI and business intelligence system.

## Core Capabilities

- AI business assistant with market context, conversation memory for logged-in users, and Gemini integration when `GEMINI_API_KEY` is configured, with a local analysis fallback.
- Live competitor discovery through OpenStreetMap Overpass API, plus verified local source records in `data/competitors.js`.
- Product-level price analytics. Prices are always tied to the product/service name, business, source, and confidence level.
- Interactive Leaflet map with clusters, competitor markers, density circles, and district opportunity overlays.
- Opportunity score, success probability, profitability probability, survival probability, break-even math, runway, and payback assumptions.
- Recharts dashboards for price distribution, profitability projection, district comparison, saturation, and rating signal.
- Authentication, saved analyses, chat history, PostgreSQL schema, and in-memory local fallback for development.
- Exportable investor report HTML and browser print-to-PDF flow.
- Dynamic English, Russian, and Kazakh UI switching.

## Tech Stack

Backend:

- Node.js
- Express
- PostgreSQL via `pg`
- Gemini API through direct HTTPS calls

Frontend:

- Next.js 16
- React 19
- TailwindCSS tooling
- Framer Motion
- Recharts
- Leaflet and Leaflet marker clustering
- Lucide React icons

## Project Structure

```text
.
├── data/competitors.js          # Verified local source data and business profiles
├── db/schema.sql                # PostgreSQL tables
├── index.js                     # Express API
├── services/
│   ├── ai.js                    # Gemini/local AI assistant
│   ├── analysis.js              # Main market analysis pipeline
│   ├── analytics.js             # Market signal analytics
│   ├── auth.js                  # Password hashing and signed auth tokens
│   ├── charts.js                # Recharts-ready datasets
│   ├── database.js              # PostgreSQL + memory fallback repository
│   ├── export.js                # Investor report generation
│   ├── map.js                   # Map bounds and marker model
│   ├── narratives.js            # AI explanations for dashboard sections
│   ├── overpass.js              # OpenStreetMap Overpass live fetcher
│   ├── parser.js                # Price parser orchestration
│   ├── prices.js                # Verified and scraped product-level prices
│   ├── probability.js           # Probability and profitability formulas
│   └── recommendations.js       # Recommendation text generation
└── frontend/
    ├── app/page.jsx             # SaaS dashboard
    ├── app/components/CompetitorLeafletMap.jsx
    ├── app/globals.css
    └── postcss.config.mjs
```

## Environment Variables

Create `.env` in the project root:

```bash
PORT=5000
FRONTEND_PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/venturescope
AUTH_SECRET=replace-with-a-long-random-secret
AUTH_TOKEN_TTL_SECONDS=604800
GEMINI_API_KEY=
GEMINI_MODEL=gemini-flash-lite-latest
GEMINI_FALLBACK_MODELS=gemini-flash-lite-latest,gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-flash-latest
GEMINI_TIMEOUT_MS=15000
OVERPASS_URLS=https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter
OVERPASS_TIMEOUT_MS=7000
PRICE_PAGE_TIMEOUT_MS=3500
```

Frontend variables are passed by the dev runner:

```bash
API_URL=http://localhost:5000
NEXT_PUBLIC_API_URL=http://localhost:5000
```

If `DATABASE_URL` is missing or PostgreSQL is unavailable, the API starts with memory storage so local analysis still works. Production deployments should use PostgreSQL.

## PostgreSQL Setup

1. Create a database:

```bash
createdb venturescope
```

2. Set `DATABASE_URL` in `.env`.

3. Start the API. Tables are created automatically from `db/schema.sql` on boot:

```bash
npm run server
```

The schema includes:

- `users`
- `competitors`
- `analyses`
- `chat_history`
- `prices`
- `cached_requests`
- `ai_recommendations`

## Installation

From the project root:

```bash
npm install
npm --prefix frontend install
```

## Development

Start backend and frontend together:

```bash
npm run dev
```

The runner selects free ports automatically. Typical URLs:

```text
Backend:  http://localhost:5000
Frontend: http://localhost:3000
```

Run only the API:

```bash
npm run server
```

Run only the frontend:

```bash
npm run client
```

## Production Build

```bash
npm run build
```

Start the API:

```bash
npm start
```

Start the compiled frontend from `frontend`:

```bash
npm --prefix frontend run start
```

Set the private server-side `API_URL` to the deployed API origin before starting the frontend. Browser requests should use the same-origin `/api` proxy; do not expose backend secrets through `NEXT_PUBLIC_*` variables.

## Production Deployment with Docker Compose

The root `compose.yaml` runs the Next.js web app, Express API, and PostgreSQL. Only the web container is published; API and database ports stay on the private Compose network. PostgreSQL data lives in the named `teztap-postgres` volume.

1. Copy `deploy/.env.example` to `deploy/.env`.
2. Generate independent URL-safe secrets and put them into `POSTGRES_PASSWORD` and `AUTH_SECRET`:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Run the command twice. Use a unique database password and an `AUTH_SECRET` of at least 32 characters. The app refuses to start in production without the auth secret. URL-safe characters avoid breaking the database connection URL.
3. Add `GEMINI_API_KEY` and `TWOGIS_API_KEY` on the server if those integrations are enabled. Keep them in the server environment; never prefix them with `NEXT_PUBLIC_`.
4. Set `CORS_ORIGINS` to the exact public frontend origin(s), including `https://` and no trailing slash. Same-origin TezTap requests use the Next.js API proxy.
5. Start the stack from the repository root:

```bash
docker compose --env-file deploy/.env -f compose.yaml up --build -d
```

6. Check readiness and logs:

```bash
docker compose --env-file deploy/.env -f compose.yaml ps
docker compose --env-file deploy/.env -f compose.yaml logs -f api web
```

The site listens on `WEB_PORT` (default `3000`). Put an HTTPS reverse proxy/load balancer in front of it and point the public hostname at that port. Configure its health check at `/api/health`. The API health endpoint reports its database mode; production startup fails instead of silently switching to in-memory storage if PostgreSQL is missing.

Before a release, take a PostgreSQL backup and verify restore procedures. The application applies compatible schema changes at API startup; use a staging database to review schema changes before production upgrades. For horizontally scaled deployments, put rate limiting and shared caching at the gateway, since the current API rate limiter and external-data caches are process-local.

To stop containers while retaining database data:

```bash
docker compose --env-file deploy/.env -f compose.yaml down
```

Do not remove the named database volume when stopping or updating the service.

## API Endpoints

```text
GET  /api/health
GET  /api/options
POST /api/auth/register
POST /api/auth/login
GET  /api/me
GET  /api/analyses
POST /api/analyze-market
POST /api/chat
POST /api/chat/stream
GET  /api/competitors
GET  /api/prices
GET  /api/2gis/suggest
GET  /api/2gis/geocode
GET  /api/2gis/regions
GET  /api/2gis/categories
GET  /api/2gis/markers
POST /api/2gis/route
POST /api/2gis/distance-matrix
POST /api/2gis/isochrone
POST /api/2gis/map-matching
POST /api/2gis/delivery-plan
POST /api/export/report
```

Aliases also exist for the requested public endpoints:

```text
POST /analyze-market
POST /chat
GET  /competitors
GET  /prices
```

Example analysis request:

```json
{
  "city": "Aktau",
  "budget": 8000000,
  "businessType": "cafe"
}
```

## Data Policy

The platform does not invent prices. If a public source provides business listings but not product-level prices, the UI and AI assistant state that directly. For every displayed price, the response includes:

- `productName`
- `price`
- `businessName`
- `area`
- `category`
- `sourceName`
- `sourceUrl`
- `confidence`

Live competitor data comes from OpenStreetMap Overpass when available. Aktau seed records include verified public listings and source URLs. You can add new verified sources in `data/competitors.js`.

Discovery uses the 2GIS Catalog API for places and education when `TWOGIS_API_KEY` is available, with the existing OSM data adapter retained as fallback. The server also exposes 2GIS Suggest, Geocoder, Regions, Categories, Markers, Routing, Distance Matrix, Isochrone, Map Matching, and TSP adapters. The API key stays server-side. Cost-bearing navigation POST routes require an authenticated SMART_MAP account; request sizes are bounded and read responses are cached. OSM remains the interactive map baselayer. Static maps and raster tiles are not enabled because tile/image loads are billed separately and require the matching 2GIS product access. Radar is not wired into the web app because browser-based Wi-Fi/cell scanning is unavailable and would require explicit device-data consent.

## AI Assistant

Set `GEMINI_API_KEY` to enable Gemini-backed answers. Without a Gemini key, `/api/chat` still works using the local market reasoning engine and the current analysis object.

The assistant is instructed to:

- use only supplied market context;
- avoid invented competitors, prices, ratings, or sources;
- explain economic reasoning;
- call out evidence gaps;
- answer in the selected UI language.

## Verification

Backend smoke test:

```bash
npm run check
```

Frontend production build:

```bash
npm run build
```

Full dev stack smoke test:

```bash
npm run check:dev
```

## Deployment Notes

1. Use Docker Compose above, or provision PostgreSQL and deploy the Express API and Next app as separate services.
2. Set `DATABASE_URL`, a private `AUTH_SECRET`, and optional Gemini/2GIS API keys on the server.
3. Set the Next server's private `API_URL` to the API service address. Do not set browser-visible `NEXT_PUBLIC_API_URL` for production.
4. Restrict `CORS_ORIGINS` to exact trusted origins if the API is exposed outside the private web/API network.
5. Add HTTPS, backups, and monitoring for database health, Overpass latency, and AI/data-provider errors.

## Investor Demo Flow

1. Register or log in.
2. Choose city, business type, and budget.
3. Run analysis.
4. Review score, probabilities, map, competitors, prices, and growth insights.
5. Ask the AI assistant follow-up questions.
6. Export the investor report or print it to PDF.
## Commercial property marketplace

Mercora can connect a completed market analysis to verified commercial-space listings without generating demo properties. Listings submitted through `POST /api/properties` remain `PENDING` until a moderator listed in `PROPERTY_MODERATOR_EMAILS` marks them `VERIFIED` or `ACTIVE`. Public search returns only verified/active records and hides owner contact data.

Key routes: `GET /api/properties`, `POST /api/properties/recommendations`, `POST /api/properties`, `PATCH /api/properties/:id`, and `POST /api/properties/:id/moderate`.

`PROPERTY_OWNER_DAILY_LIMIT` and `PROPERTY_SEARCH_RADIUS_KM` are optional environment settings. Property Fit Score is calculated by the backend from the current analysis, distance, budget fit, area, district opportunity, competition, and accessibility; Gemini receives the result only as structured evidence.
