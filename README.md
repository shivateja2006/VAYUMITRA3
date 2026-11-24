# Vayumitra — Urban Air Quality Assistant for India

Vayumitra is a full-stack, GenAI-powered urban air quality assistant built for Indian families and Resident Welfare Associations (RWAs) to navigate winter smog and high-pollution episodes using live Indian CPCB NAQI telemetry.

## Key Capabilities

- **Indian CPCB NAQI & Telemetry:** Tracks 15+ major Indian metros and NCR/North hubs, supports India-wide city search and browser geolocation, computes official Indian NAQI breakpoints (`PM2.5`, `PM10`, `NO₂`, `O₃`), compares against WHO 24-hour guidelines, and highlights today's cleanest ventilation window vs. peak smog window.
- **AQI-Adaptive Theme Engine:** Automatically shifts UI palettes across **Good Air** (NAQI `0–100`), **Caution Haze** (NAQI `101–200`), and **Bad Air Alert** (`NAQI > 200`), with persisted `Auto (AQI)`, `Light`, and `Dark` overrides.
- **Browser Worsening Alerts:** Polls active location telemetry and dispatches native Browser `Notification` API alerts (plus in-app alert banners) whenever the active city's NAQI severity worsens.
- **Interactive Area-Wise Air Quality Map:** Google Maps Platform integration with live neighborhood zone markers, All-India metro toggle, and India CPCB heatmap tile overlays.
- **GenAI Action Planner & Conversational Assistant:** Server-side Gemini integration generates household- and commute-tailored low-emission routines, cost-tiered indoor air quality hacks, and sustainable swaps with an interactive **Direct Choice Impact** calculator (`% PM2.5 exposure drop` and `kg CO₂e avoided / week`).

## Architecture

- `src/`: Modular React 19 + TypeScript + Tailwind CSS v4 frontend with custom hooks (`hooks/useAqiTheme.ts`, `hooks/useVayumitraDashboard.ts`), fault-isolating `ErrorBoundary` panels, and focused UI components (`WorkspaceToolbar`, `DangerousRunningBar`, `TopCitiesBar`, `LocationHero`, `AreaAirQualityMap` + `map/MapOverlays.tsx`, `VayumitraPlanner` + `planner/PlannerActionSections.tsx`, `VayumitraChat`).
- `server/`: Modular Express backend split into clean routers (`routes/aqiRoutes.ts`, `routes/mapsRoutes.ts`, `routes/assistantRoutes.ts`) and domain services (`naqi.ts`, `googleAq.ts`, `cities.ts`, `gemini.ts`, `validation.ts`) handling Indian CPCB NAQI math, Google Air Quality API (`ind_cpcb`) with quota-resilient history fallback, Open-Meteo fallback, Google Maps AQ tile proxying, input validation, response caching, and bounded Gemini API retries/fallback.
- `server.ts`: Express + Vite middleware / static production entrypoint on port `3000`.
- `tests/`: Automated unit, backend integration, notification, and React UI component tests powered by Vitest.

## Testing & Verification

The project includes 6 automated Vitest test suites (`tests/*.test.{ts,tsx}`):

- `tests/naqi.test.ts`: Official 6-pollutant Indian CPCB NAQI breakpoints, sub-index dominance, 24h/8h rolling averages, and ventilation/smog window detection.
- `tests/googleAq.test.ts`: Google Air Quality `ind_cpcb` pollutant extraction, ppb-to-µg/m³ conversion, IST hourly formatting, 429 quota history fallback, and controlled batch concurrency.
- `tests/gemini.test.ts`: Input sanitization, error parsing, primary model retries, `AbortController` timeout failover, cooldown routing, and contextual prompt construction.
- `tests/api.test.ts`: `supertest` Express API route tests covering health headers, coordinate validation, Indian city search, AQ tile validation, live Google Air Quality integration, and plan caching/refresh.
- `tests/notifications.test.ts`: Severity ranking, worsening AQI detection, native Browser `Notification` dispatch, and denied-permission fallback.
- `tests/components.test.tsx`: `@testing-library/react` DOM, accessibility (`aria-pressed`, `role="alert"`, `role="status"`, `role="progressbar"`), theme toggling, interactive choice impact math, planner state feedback, and chat flow tests.

## Scripts

```bash
npm run dev      # Start full-stack dev server on http://localhost:3000
npm test         # Run full Vitest test suite (unit, API, and UI component tests)
npm run lint     # TypeScript type-check (tsc --noEmit)
npm run build    # Production frontend bundle (vite build)
npm start        # Run production server (node server.ts)
```

## Environment Variables

Configure secrets in `.env` (see `.env.example`):

- `GEMINI_API_KEY`: Required server-side key for `@google/genai` action plans and chat.
- `VITE_GOOGLE_MAPS_API_KEY` / `GOOGLE_MAPS_API_KEY`: Required for interactive Google Maps, Google Air Quality `ind_cpcb` readings, and CPCB heatmap tiles.
