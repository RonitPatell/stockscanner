# TrustTicker Monitor — Initial Load Path Audit

**Date:** 2026-07-27  
**Scope:** Complete first-load path for Monitor / scanner (`/dashboard?view=monitor` and related APIs).  
**Constraint:** Production behavior unchanged except temporary **development** performance marks.  
**Status:** Audit complete. **No performance improvements claimed** — proposals are unverified until measured after implementation.

---

## 1. Executive summary

Monitor does not own its first paint. It rides the Pro **dashboard RSC page**, which always loads feed + legacy scanner Redis seeds, then a large client shell that:

1. Defaults `destination` to `"feed"` and only reads `?view=monitor` in a `useEffect` (one paint of Feed / `LiveScanner` before Monitor).
2. Statically imports Monitor **and** LiveScanner, DilutionRadar, FocusMode, MarketMonitor, etc. (no route-level code-split for Monitor).
3. Mounts Monitor with **empty client state**, then `useMonitorDelivery` fetches `/api/monitor/snapshot` and only afterward opens SSE `/api/monitor/stream` (which sends **another** full snapshot).
4. Falls back to **fixture tickers** (`AAAA`…) whenever live ladder is empty — so “first ticker” can be demo data while the badge looks live.
5. Artificially holds `connection === "loading"` for **350ms** even when delivery already has data.

Server hub ranking is process-local (not per-browser market math). Domain Momentum/Attention engines are **not** on the user mount path; cron `monitor-delivery` fills the hub under cron auth.

---

## 2. Component ownership

| Layer | Owner | Role on initial load |
| --- | --- | --- |
| Middleware | `middleware` (headers only) | No Pro / Monitor gate |
| RSC page | `src/app/dashboard/page.tsx` | `auth()` → Prisma user → Redis feed + scanner snapshot → `TradingDashboard` |
| Shell | `DashboardShellV3` | Destination state, static feature imports, `LiveQuoteProvider`, Platform Guide, onboarding delay |
| Beta gate | `MonitorBetaChrome` | Client `GET /api/monitor/rollout` (Prisma user flags) |
| Monitor UI | `TrustTickerMonitor` | Ladder / field / intel; fixture merge; 350ms load delay |
| Delivery client | `useMonitorDelivery` | Snapshot → SSE → rAF apply → ack every 15s |
| Hub | `MonitorDeliveryHub` via `getMonitorDeliveryHub()` | Process-local ladder (top 64); Redis checkpoint for workers |
| Snapshot API | `GET /api/monitor/snapshot` | `requirePro` → ops Redis → `hub.latestSnapshot()` |
| Stream API | `GET /api/monitor/stream` | `requirePro` → SSE snapshot + poll deltas |
| Cron ingest | `POST /api/cron/monitor-delivery` | Cron-only; **not** started by browser traffic |
| Guide | `PlatformGuide` | Mounted closed; localStorage version key; no auto-open on load |
| Harness | `/e2e/monitor-harness` | Seeded UI; live delivery disabled |

**Server / Client boundary**

- Dashboard page = **Server Component** (auth, Prisma, Redis reads).
- Shell, Monitor, LiveScanner, Guide = **Client Components** (`"use client"`).
- No `loading.tsx` / Suspense boundary on `/dashboard`.
- Monitor snapshot is **not** passed as RSC props today — only legacy `initialCatalysts` / `initialScanner`.

---

## 3. Request waterfall (intended production path)

```
1. Navigation begins
   └─ Browser → GET /dashboard?view=monitor

2. Server response begins
   ├─ auth() session
   ├─ prisma.user.findUnique (subscription, watchlist, scannerFilters)
   ├─ if Pro: Promise.all([
   │     getCachedFeed("all")          // Redis (≤2.5s budget)
   │     getCachedScannerSnapshot()    // Redis
   │  ])
   │  └─ optional getCatalysts(150) race 2.5s if feed empty
   └─ HTML + RSC payload (TradingDashboard props) → response complete

3. JavaScript downloads
   └─ Large client graph: DashboardShellV3 + LiveScanner + Monitor + Risk/Review/… panels
      (static imports — Monitor not dynamically isolated)

4. Hydration starts → completes
   └─ Shell hydrates with destination = "feed" (hardcoded useState)

5. First client effects (still destination=feed)
   ├─ LiveScanner mounts (feed branch true)
   │   ├─ GET /api/alert-strategies (Feed V3)
   │   ├─ GET /api/settings (possible)
   │   ├─ poll / EventSource /api/catalysts/stream
   │   └─ LiveQuoteProvider may open /api/quotes/stream if symbols register
   ├─ destinationFromSearchParams → setDestination("monitor")
   ├─ LiveScanner unmounts; TrustTickerMonitor mounts
   ├─ GET /api/monitor/rollout (MonitorBetaChrome)
   ├─ GET /api/onboarding (delayed 1.5s — unrelated)
   └─ dynamic import("../TradingViewMiniChart") prefetch

6. Monitor delivery (useMonitorDelivery, if marketStreamV1)
   ├─ GET /api/monitor/snapshot          ← begin / complete
   │   └─ requirePro (auth + Prisma again)
   │   └─ loadMonitorOpsControls (Redis)
   │   └─ hub.latestSnapshot()
   ├─ apply snapshot → ladder state (rAF)
   ├─ EventSource /api/monitor/stream    ← begin
   │   └─ requirePro again
   │   └─ immediate SSE type=snapshot (duplicate payload)
   │   └─ type=connected + deltas
   └─ POST /api/monitor/ack every 15s (after seq ≥ 1)

7. Market snapshot “available”
   ├─ Ideal: first successful snapshot apply (HTTP or SSE)
   └─ Observed UI: fixture ladder if live.ladder.length === 0

8. First ticker renders
   ├─ Fixture path: immediate after Monitor mount (demo symbols)
   └─ Live path: after snapshot/SSE apply + React commit

9. Live stream connects
   └─ EventSource open + first message (connected / snapshot)

10. Scanner fully interactive
    ├─ Ladder rows + connection not stuck on loading
    ├─ Blocked ~350ms by artificial loading timer when initialConnection=live
    └─ Field / intel / tape may still hydrate secondary fixture data
```

### Auth waterfall (duplicate work)

| Step | Auth work |
| --- | --- |
| RSC `/dashboard` | `auth()` + Prisma subscription select |
| Each Monitor API | `requirePro` → `auth()` + Prisma user select again |
| Snapshot then stream | Two sequential Pro gates on cold path |
| Rollout | `requireUser` + Prisma opt-out / cohort fields |

Session is not reused across these boundaries in application code; each request re-resolves.

---

## 4. Measured timing

### 4.1 Instrumentation (temporary, dev-only)

Module: `src/lib/monitor/perf-marks.ts`  
Enabled when `NODE_ENV === "development"` or `NEXT_PUBLIC_MONITOR_PERF_MARKS=1`.

| Mark | Where |
| --- | --- |
| `monitor_navigation_start` | Module eval of `TrustTickerMonitor` (approx. JS-ready, **not** true navigationStart) |
| `monitor_html_received` | First Monitor mount effect + Navigation Timing `responseStart` detail |
| `monitor_hydration_complete` | Same first effect (proxy for hydrated Monitor) |
| `monitor_snapshot_rendered` | Ladder length > 0 (`useMonitorDelivery` and/or VM) |
| `monitor_stream_connected` | SSE `type === "connected"` |
| `monitor_live_synced` | First stream message with symbols in runtime |
| `monitor_interactive` | Ladder + non-loading connection (or e2e seed) |

Inspect: `performance.getEntriesByType("mark")` or `window.__MONITOR_PERF__`.  
Helper script: `node scripts/measure-monitor-load.mjs [url]`.

### 4.2 Harness measurement (2026-07-27, local `next dev`)

URL: `/e2e/monitor-harness?scenario=emerging`  
Live delivery **disabled** (seeded fixture) — stream marks intentionally absent.

| Metric | Value |
| --- | --- |
| Wall time to `domcontentloaded` | ~256 ms |
| Navigation `responseStart` | ~173 ms |
| `domContentLoadedEventEnd` | ~253 ms |
| `loadEventEnd` | ~356 ms |
| HTML transferSize | ~12.9 KB |
| `monitor_navigation_start` → `monitor_interactive` | **~68 ms** (measure) |
| Snapshot source | `fixture` (expected for harness) |
| Stream marks | n/a (delivery off) |

### 4.3 Authenticated `/dashboard?view=monitor`

**Not measured in this audit** (requires Pro session + real hub data + `marketStreamV1`).

Use the same marks after login:

```js
// DevTools console after load
copy(window.__MONITOR_PERF__)
performance.getEntriesByName("monitor_nav_to_interactive")
```

Record at minimum: TTFB, DCL, snapshot fetch duration, stream open, first ladder from `source=delivery`, interactive mark, and whether a Feed flash occurred (`data-destination` flipped feed→monitor).

---

## 5. Network waterfall (conceptual)

```
Time →
[======= RSC /dashboard (auth+Prisma+Redis feed+scanner) =======]
                         [==== JS bundles (shell+scanner+monitor) ====]
                                      [hydrate]
                                      [LiveScanner flash APIs····]
                                           [unmount LiveScanner]
                                           [rollout GET]
                                           [snapshot GET =====]
                                                              [SSE stream ~~~~~~~~~~~~~~~~~~~~~~~~]
                                                              [snapshot again via SSE]
                                           [···· onboarding @1.5s ····]
```

Parallelism today: feed Redis ∥ scanner Redis on SSR only.  
**Not** parallel on client: snapshot → then stream; rollout independent but not coordinated; onboarding delayed.

---

## 6. Findings (root causes & classifications)

### 6.1 Client-only data that could be server-side

| Data | Today | Opportunity |
| --- | --- | --- |
| Monitor ladder snapshot | Client `GET /api/monitor/snapshot` | Pass `hub.latestSnapshot()` from RSC (same Pro gate as page) |
| Rollout / cohort | Client `/api/monitor/rollout` | Resolve in RSC; pass flags as props |
| Feed/scanner seeds | Already SSR | Wasted work when `view=monitor` |

### 6.2 Sequential requests that could run in parallel

- `snapshot` **then** `EventSource(stream)` — stream alone already sends a snapshot; either skip HTTP snapshot when stream is mandatory, or open stream immediately and treat HTTP as optional warm.
- `rollout` ∥ `snapshot` — already independent; ensure Monitor UI does not wait on rollout chrome (today chrome returns `null` until rollout loads; Monitor still mounts if env `monitorV1` true).

### 6.3 Calculations repeated per browser

- **Not** full Momentum/Attention engines on the client (good).
- Hub `deriveAttention` / rank top **64** runs on **server process** when events ingest — shared across users of that instance.
- Client still: tier mapping, fixture intel seeds, event-tape UI fixtures, field lerp — presentation only.
- Domain engines exist under `src/domain/monitor/{momentum,attention}` but are **not wired** into the browser mount path.

### 6.4 Workers initialized by user traffic

- Browser traffic does **not** start ingest workers.
- `getMonitorDeliveryHub()` is lazy process singleton — first snapshot/stream on a cold serverless instance may see **empty hub** until cron/worker has restored checkpoint / ingested.
- Cold-start risk: empty snapshot → fixture UI → looks “live”.

### 6.5 Empty initial state from `useEffect`

- `destination = "feed"` until effect → Feed flash + LiveScanner mount/unmount.
- `useMonitorDelivery` starts with `ladder = []`, `connection = "loading"`.
- TrustTickerMonitor merges **fixture** when ladder empty → masks empty state with demo tickers.
- Artificial **350ms** `loading` overlay after mount.

### 6.6 Queries blocked by unrelated slow requests

- SSR always pays Redis feed (+ optional catalyst rebuild up to 2.5s) even for Monitor-only navigation.
- Client onboarding at 1.5s is low priority but shares connection pool / main thread when it fires.
- LiveScanner flash can open catalysts SSE briefly on Monitor deep links.

### 6.7 Authentication waterfalls

- Page Pro check, then snapshot Pro, then stream Pro, then ack Pro — repeated `auth()` + Prisma.
- Entitlement recheck timer on long-lived SSE (`userStillHasPro`) — correct for security, adds periodic DB after connect (not first paint).

### 6.8 Duplicate requests

- Full ladder snapshot: HTTP snapshot **and** first SSE event.
- Possible double `/api/monitor/snapshot` on visibility restore after 5s hidden (by design).
- Feed flash may start catalysts stream that immediately tears down.

### 6.9 Bundle-size bottlenecks

- `DashboardShellV3` static imports LiveScanner, DilutionRadar, FocusModeV2, MarketMonitor, CallBoard, paper/ledger panels, **and** TrustTickerMonitor.
- No `next/dynamic` for Monitor destination.
- TradingView mini chart is dynamically prefetched (good) but still kicked on every dashboard load including Monitor.

### 6.10 Cold-start-sensitive routes

- All Monitor APIs: `export const dynamic = "force-dynamic"`.
- Stream: `maxDuration = 300`.
- Hub + ops controls are memory/Redis; empty memory on new isolate until restore/cron.
- Dashboard page itself is cold-start sensitive (auth + Prisma + Redis).

### 6.11 Waiting for all features before core data

- Core ladder does **not** wait for Guide, onboarding, or intel dossiers.
- Soft waits: 350ms loading timer; fixture until delivery; rollout chrome null until fetch (Monitor still shown via env flag).
- Event tape / selected intel still heavily fixture-seeded — analytical panels can look complete while market path is empty.

### 6.12 Platform Guide

- Mounted on every dashboard shell render; `open` defaults **false**.
- Does not block Monitor data.
- Versioned via `PLATFORM_GUIDE_VERSION` / localStorage — no network on init.

### 6.13 Suspense / dynamic imports

- No dashboard `loading.tsx`.
- No Suspense around Monitor.
- Only notable dynamic import on shell: TradingView prefetch (not Monitor).

### 6.14 Symbol universe & snapshot storage

- Hub tracks up to **10_000** symbols (LRU); publishes ladder size **64**.
- Checkpoint: Redis `tt:monitor:delivery:v1:checkpoint` (worker restore), not read on every browser snapshot by default beyond in-process hub.
- Ops controls: Redis `tt:monitor:ops:v1:controls` loaded on snapshot/stream.

### 6.15 Unused / parallel APIs on Monitor UI

- `/api/monitor/event-tape` — not requested on Monitor mount (tape is fixture-backed in UI).
- Legacy Market Monitor scanner snapshot is SSR’d into props but unused while `destination === monitor`.

---

## 7. Proposed changes (unverified)

Order is suggested priority for a follow-up implementation + measurement pass. **Do not treat as completed gains.**

1. **Initialize destination from URL on first client render** (lazy `useState(() => destinationFromSearchParams(...))` or SSR-passed `initialDestination`) — eliminate Feed flash and LiveScanner mount.
2. **Skip SSR feed/scanner work when `view=monitor`** (or make them lazy) — shorten HTML TTFB for Monitor landings.
3. **SSR-pass Monitor snapshot + rollout** into `TrustTickerMonitor` — first paint with real ladder; client SSE for deltas only.
4. **Open SSE first** (or drop redundant HTTP snapshot when stream enabled) — remove duplicate snapshot + sequential wait.
5. **`next/dynamic` Monitor vs Feed destinations** — cut unused panel JS from Monitor-first loads.
6. **Remove or gate the 350ms artificial loading timer** when delivery already reports live/degraded.
7. **Do not render fixture ladder when `marketStreamV1` is on** — show loading/empty states instead of demo tickers.
8. **Unmount or never mount LiveScanner when destination is monitor** (already conditional after destination fix) — confirm no hidden-tree retention.
9. **Cache `requirePro` user entitlement briefly per request id / edge** only if security review approves — reduce Prisma stampede (snapshot+stream+ack).
10. **Ensure cron restore-on-boot** before serving empty hub in production isolates — avoid cold empty → fixture.

After each change: re-run marks on authenticated Monitor and record deltas in a new section. **No improvement claims until then.**

---

## 8. Risks

| Risk | Note |
| --- | --- |
| SSR snapshot staleness | Snapshot at HTML time may be older than SSE; client must prefer higher sequence |
| Skipping HTTP snapshot | Clients that block EventSource need a fallback |
| Hiding fixtures | Empty hub becomes visible outage — needs honest empty/degraded UI (already partially built) |
| Destination SSR | Must stay consistent with `monitorV1` / cohort / opt-out |
| Entitlement caching | Short TTL only; never weaken Pro gate |
| Code-splitting | Watch for Focus Mode / Guide targets that assume Feed DOM present |
| Perf marks in prod | Keep gated; remove after measurement campaign |

---

## 9. How to re-measure

1. Dev server with `marketStreamV1` / Monitor flags as in target env.
2. Log in as Pro; open `/dashboard?view=monitor`.
3. Console: `window.__MONITOR_PERF__` and Network waterfall (snapshot, stream, rollout).
4. Optionally: `node scripts/measure-monitor-load.mjs "http://localhost:3000/dashboard?view=monitor"` with storage state / auth cookie injected.
5. Compare harness baseline (§4.2) vs authenticated path; attach numbers here before claiming wins.

---

## 10. Files touched for this audit

| File | Change |
| --- | --- |
| `src/lib/monitor/perf-marks.ts` | **Added** — temporary mark helpers |
| `src/hooks/useMonitorDelivery.ts` | Dev marks: snapshot / stream / live sync |
| `src/components/monitor/TrustTickerMonitor.tsx` | Dev marks: nav / html / hydrate / interactive |
| `scripts/measure-monitor-load.mjs` | Local measurement helper |
| `docs/monitor-initial-load-audit.md` | This document |

No production performance optimizations were implemented in this pass.
