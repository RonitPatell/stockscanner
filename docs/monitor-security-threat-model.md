# TrustTicker Monitor — Security Threat Model

**Scope:** Monitor UI, Event Tape, Alert Strategy / presets, pin-mute, watchlist hooks, SSE streams, admin replay/calibration, health, flags, cron ingest, analytics.  
**Date:** 2026-08-01  
**Stance:** Defense in depth. Not “unhackable.”

## Assets

| Asset | Sensitivity |
|-------|-------------|
| Session identity / Pro entitlement | High |
| Per-user alert strategies & presets | High (private) |
| Watchlist, mute preferences | Medium (private) |
| Shared Event Tape / catalysts / quotes | Medium (Pro product data) |
| Admin replay sessions / calibration | High (ops) |
| Provider API keys, `CRON_SECRET`, Stripe | Critical |
| Analytics events | Low (must stay PII-free) |

## Trust boundaries

```
Browser ──HTTPS──► Next.js API / SSE
                      │
          ┌───────────┼────────────┐
          ▼           ▼            ▼
     Session auth   Cron Bearer   Admin email
     (requireUser/  (authorizeCron) (requireAdmin)
      requirePro)
          │
          ▼
     Postgres (user-scoped rows) / Redis (shared cache)
          │
          ▼
     Market-data adapters (server-only secrets)
```

## Actors & abuse cases

1. **Anonymous** — probe public `/api/health`, forge cron, scrape flags.
2. **Authenticated free user** — hit Pro Monitor/SSE without entitlement.
3. **Pro User A** — IDOR User B strategies/watchlist/private streams; inject `userId`.
4. **Malicious feed/catalyst URL** — `javascript:` / phishing via Monitor links.
5. **Strategy JSON importer** — prototype pollution / code execution attempts.
6. **Lapsed subscriber** — keep SSE open after subscription ends.
7. **Admin compromise / abuse** — huge replay uploads; calibration DoS.
8. **Cron secret leak / missing** — unauthorized ingest.

## Controls (target state)

| Control | Mechanism |
|---------|-----------|
| No client `userId` ownership | Session `authz.user.id` only |
| Private queries session-scoped | `where: { userId }` / vault ownerId |
| SSE auth + entitlement | `requirePro` at open + periodic `userStillHasPro` |
| Cross-user private streams | Owner match required; shared tape is product data |
| Admin gates | `requireAdmin` + `ADMIN_EMAILS` |
| Provider credentials | Server adapters; refs/booleans only in JSON |
| Public health | Aggregates; `feedSource` redacted to `none\|ok` |
| Analytics | Funnel event allowlist + banned prop keys |
| Expensive routes | Rate limits on event-tape, replay, calibration |
| Cron | Fail-closed without/incorrect `CRON_SECRET` |
| Strategy import | JSON parse + AST validate; no `eval` |
| Labels / HTML | React text nodes; no `dangerouslySetInnerHTML` |
| Source URLs | `safeHttpUrl` http(s) only |

## Residual risks

- Pin/mute currently client `localStorage` — device-local, not cross-device IDOR, but not server-authoritative.
- Shared Event Tape is intentionally not per-user (Pro product data).
- Rate limits degrade to per-instance memory without Redis (`strict` halves limits).
- Admin is a powerful trust boundary; compromised admin can still stress replay memory within caps.

## Regression

`npm run test:monitor-security`
