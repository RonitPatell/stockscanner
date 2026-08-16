# TrustTicker V2 — Entitlement migration list

**Checkpoint:** Single product entitlement (`hasTrustTickerAccess` / `requireTrustTickerAccess`).  
**Date:** 2026-08-16

## Authoritative API

| Helper | Role |
|--------|------|
| `resolveAccessState(user, now?)` | AccessState machine |
| `hasTrustTickerAccess(user, now?)` | Boolean full OS access |
| `requireUser()` | Authenticated session only |
| `requireTrustTickerAccess()` | Session + entitled |
| `requirePlus` / `requirePro` | **Deprecated** wrappers → `requireTrustTickerAccess` |

Access states: `anonymous` | `trial_eligible` | `trialing` | `active` | `grace` | `past_due` | `expired`.

Entitled: `trialing`, `active`, `grace`, `past_due`.

## Converted Investor OS API routes

All former `requirePro` call sites now use `requireTrustTickerAccess`:

- `api/feed`
- `api/scanner`
- `api/quotes`, `api/quotes/stream`
- `api/catalysts`, `api/catalysts/[id]`, `api/catalysts/refresh`, `api/catalysts/stream`
- `api/dilution`
- `api/session-plan`, `api/session-recap`
- `api/premarket`, `api/earnings`, `api/halts`
- `api/sympathy`, `api/analogue`, `api/calibration`
- `api/calls`, `api/catches`, `api/autopsy`
- `api/alerts/history`, `api/alerts/preview`
- `api/playbooks`, `api/replay`, `api/translate`
- `api/speed-edge`, `api/speed-backtest`
- `api/market-state`
- `api/monitor/ack`, `api/monitor/stream`, `api/monitor/snapshot`, `api/monitor/event-tape` (GET)

## Settings

- Watchlist / alert rule mutations require `hasTrustTickerAccess` (no Free/Plus split).
- `FREE_WATCHLIST_LIMIT` deprecated; entitled → unlimited, else → 0.

## SSE

- `userStillHasPro` re-checks via `hasTrustTickerAccess` (includes `cancelAtPeriodEnd`).

## Intentionally public (unchanged)

- Marketing `/`, `/pricing`, `/demo`, `/wins`, `/today` (page), `/ticker/[symbol]`
- `/api/health`, `/api/public-stats`, Stripe webhook (signature), cron (secret)
- Auth register/login

## Deprecated but retained

| Symbol | Behavior |
|--------|----------|
| `planTier` DB column | Still written by webhook for legacy labels; **not** feature-gated |
| `hasPlusAccess` / `hasProAccess` | Alias of `hasTrustTickerAccess` |
| `resolvePlanTier` | Entitled → plus/pro label; else free (legacy UI) |
| `hasActiveSubscription` | Alias of `hasTrustTickerAccess` (string or object) |
| `requirePlus` / `requirePro` | Alias of `requireTrustTickerAccess` |

## Schema additive

- `User.cancelAtPeriodEnd Boolean @default(false)` — set from Stripe webhooks.

## Remaining UI follow-ups (not blocking this checkpoint)

- Landing/pricing freemium copy → single SKU ($19.99 / $149.99)
- Dashboard shell ModulePaywall / Markets|Structure → use server `entitled` only
- Remove deprecated Plus/Pro helpers once no callers remain
- Drop `planTier` column only after analytics/legacy no longer need it

## Security notes

- Entitlement from DB fields loaded via `session.user.id` only.
- Checkout success query params are UX-only; never grant access.
- Client `planTier` / localStorage / React state must not authorize APIs.
