# TrustTicker V2 — Pre-migration baseline

**Date:** 2026-08-16 (local)  
**Purpose:** Known quality baseline before V2 feature work. No env secret values are recorded here.  
**Working tree note:** Baseline commands were run with **uncommitted freemium/Investor OS edits** still present (dashboard shell, subscription, pricing, `platform-guide.ts`, etc.). Failures that assert against Platform Guide copy or freemium nav labels may reflect that dirty tree, not only `main`.

---

## Commands run

| Step | Command | Exit |
|------|---------|------|
| Lint | `npm run lint` | **1** |
| Typecheck (initial) | `npm run typecheck` | **2** (12 errors in tests) |
| Unit tests | `npm test` | **1** (493 pass / 13 fail / 1 skip of 507) |
| Production build | `npm run build` (`prisma generate && next build`) | **1** |
| Next build only | `npx next build` (skip regenerate) | **0** |
| Typecheck (after trivial test fixes) | `npm run typecheck` | **0** |
| Playwright smoke | `npx playwright test e2e/dashboard-shell.spec.ts --project=desktop --workers=1` against existing `http://localhost:3000` | **0** (4 passed, 8 skipped) |

Not run as local smoke (need auth storage, snapshots, long runtime, or optional Redis): full `npm run test:e2e`, `test:e2e:monitor*`, `test:e2e:visual*`, `test:e2e:workflow`, `test:monitor-snapshot:redis`.

---

## Typecheck

### Initial failures (all under `tests/`)

- `tests/market-workers.test.mts` — assign/delete `process.env.NODE_ENV` (read-only)
- `tests/monitor-security.test.mts` — same `NODE_ENV` pattern
- `tests/monitor-live-sync.test.mts` — EventSource mock handlers inferred as `never`
- `tests/monitor-progressive.test.mts` — fixture missing `momentumRank` / unsafe cast
- `tests/monitor-snapshot-redis.integration.test.mts` — Upstash `set` options `ex: number | undefined` with `nx`

### Trivial fixes applied (this baseline commit)

- Env mutation via `process.env as Record<string, string | undefined>`
- Progressive dossier: add `momentumRank`; cast `as unknown as MonitorSelectedTicker`
- Redis mock: only pass `ex` when defined
- Live-sync mocks: mutable EventSource stubs instead of `defineProperty` handler capture

### After fixes

- **`npm run typecheck` → pass (exit 0)**

App/source TypeScript for production: **`npx next build` reported “Finished TypeScript” successfully** (see Build).

---

## Lint (`npm run lint`)

- **Exit 1**
- Summary: **105 problems (44 errors, 61 warnings)**; ~5 errors / 7 warnings flagged as `--fix`-able
- Dominant error classes (React Compiler / eslint plugin): “Cannot call impure function during render”, “Cannot access refs during render”, plus unused vars / hook deps / prefer-const
- **Not “fixed” in this baseline** — widespread and not trivially safe without product risk

---

## Unit tests (`npm test`)

Uses `node --env-file=.env --test --experimental-strip-types tests/*.test.mts`.

| Metric | Count |
|--------|------:|
| Total | 507 |
| Pass | 493 |
| Fail | 13 |
| Skip | 1 |

### Passing areas (representative)

Most monitor domain, alert backbone (including simulated load), subscription open-status guards, dilution, ingest/priority, judgment core (partial), reliability pieces that do not hit broken imports, etc.

### Failing tests (preserved — not deleted)

| File / case | Nature |
|-------------|--------|
| `tests/catalyst-feed-v3.test.mts` (2) | Assertion mismatches (labels / expected strings) |
| `tests/dashboard-shell.test.mts` | File fail — `ERR_MODULE_NOT_FOUND` resolving `@/lib` from `src/lib/monitor/flags.ts` under node test runner |
| `tests/decision-drawer.test.mts` | Platform Guide / sticky expectation mismatch |
| `tests/judgment-presentation.test.mts` (3) | Label expectations (`Not material`, `Unclear`, review labels) |
| `tests/monitor-event-tape.test.mts` | Platform Guide bump / copy assertion |
| `tests/monitor-motion.test.mts` | Platform Guide “connection recovery” / highlight copy |
| `tests/monitor-selected-ticker.test.mts` | Guide body missing “tradeability” |
| `tests/monitor-squawk.test.mts` | Guide body missing “quiet hours” |
| `tests/monitor-ui.test.mts` | File fail — same `@/lib` path-alias issue |
| `tests/reliability.test.mts` | File fail — cannot resolve `src/lib/subscription` import from `stripe.ts` under strip-types (extension / alias) |

### Likely causes

1. **Dirty freemium `platform-guide.ts`** — guide steps rewritten for Investor OS; several tests still expect older Monitor/desk wording.  
2. **Node test path resolution** — some files import packages that use `@/` aliases or extension-less `.ts` imports; fails outside the Next bundler.  
3. **Product assertion drift** — judgment presentation / catalyst feed strings.

These are **documented as known unrelated / pre-existing relative to V2 feature work**; do not delete tests to greenwash.

---

## Build

### `npm run build` (failed)

- Failed at **`prisma generate`** with Windows **`EPERM` rename** of `query_engine-windows.dll.node` (file lock).
- Multiple local **Node** processes were running (likely Next/dev holding the Prisma engine DLL).
- **Environment-dependent** — not treated as an application compile failure.

### `npx next build` (passed)

- Compiled successfully (Turbopack).
- TypeScript finished successfully.
- Static generation completed (40/40 pages in this run).
- Warning: middleware file convention deprecated → use `proxy` (Next 16 notice).
- **Build status for app compile: PASS** when Prisma client already present.

---

## Playwright smoke

### Ran: `e2e/dashboard-shell.spec.ts` (desktop)

Designed to run locally without production credentials for the **unauthenticated** suite; authenticated block skips unless `PLAYWRIGHT_STORAGE_STATE` is set.

| Result | Count |
|--------|------:|
| Passed | 4 |
| Skipped (auth required) | 8 |

Passed cases:

- Dashboard redirect without session (`/login` or `/demo`)
- Private APIs deny without session (`/api/settings`, trader-feedback, admin)
- trader-feedback rejects client `userId` abuse
- `/status` loads

Local server: existing process on `http://localhost:3000` returned **200** for `/status`. Did **not** require Stripe/Finnhub/Redis credentials for these smoke cases.

### Not treated as local smoke (skipped for baseline)

- Authenticated shell flows (`PLAYWRIGHT_STORAGE_STATE`)
- Monitor snapshot / visual / design / layout e2e (snapshots + harness flags)
- Workflow audit script
- Redis integration: `npm run test:monitor-snapshot:redis` (needs Upstash env)

---

## Environment-dependent items

| Item | Dependency | Baseline note |
|------|------------|---------------|
| `npm test` | `.env` via `--env-file=.env` | Present locally; secrets not logged |
| `prisma generate` / full `npm run build` | Unlocked Prisma engine DLL | EPERM when Node/dev holds file |
| Redis snapshot integration | Upstash REST URL/TOKEN | Optional; test self-skips if unset |
| Finnhub / Twilio / Stripe live | Optional services | Not required for unit suite or dashboard smoke |
| Authenticated Playwright | `PLAYWRIGHT_STORAGE_STATE` | 8 tests skipped without it |
| Playwright webServer | `PLAYWRIGHT_WEB_SERVER=1` | Not needed; reused existing localhost:3000 |

---

## Known unrelated failures (carry into V2)

1. ESLint: 44 errors / 61 warnings (render purity / refs / unused).  
2. Unit: 13 failures (guide copy, judgment labels, `@/` / extension resolution under node:test).  
3. Full `npm run build` may fail on Windows with Prisma EPERM while `next dev` (or other Node) holds the query engine.  
4. Uncommitted freemium work on the working tree can skew guide/shell-related unit tests until committed or reverted.  
5. Next.js middleware → proxy deprecation warning on build.

---

## Baseline verdict

| Gate | Status |
|------|--------|
| Typecheck (after trivial test typing fixes) | **PASS** |
| Lint | **FAIL** (pre-existing volume) |
| Unit tests | **FAIL** (493/507; 13 known) |
| Next production compile | **PASS** (`npx next build`) |
| Full `npm run build` | **FAIL** (Prisma EPERM / env lock) |
| Playwright local smoke (unauth dashboard-shell) | **PASS** |

**V2 feature development may proceed** against this documented baseline. Do not treat the 13 unit failures or lint debt as introduced by later V2 checkpoints unless those checkpoints regress additional tests or re-break typecheck/build.
