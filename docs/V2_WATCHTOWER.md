# Watchtower backend

Portfolio-scoped **What Changed** feed.

> Answers: *What materially changed across the companies I monitor?*  
> Review priority only — never buy/sell advice.

## Endpoints

All require `requireTrustTickerAccess` (session + entitlement).  
**Never** accept client `userId`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/watchtower` | Cursor-paginated feed |
| `PATCH` | `/api/watchtower/events/[id]` | Mark read / dismiss / restore |
| `POST` | `/api/watchtower/events/state` | Batch read / dismiss |

## Query params (`GET`)

| Param | Notes |
|-------|--------|
| `limit` | 1–100 (default 25) |
| `cursor` | Opaque base64url cursor |
| `since` / `until` | ISO bounds on `occurredAt` |
| `category` | CSV of CompanyEvent categories |
| `severity` | CSV of legacy severities (`critical`, `material`, …) |
| `significance` | CSV of `HIGH`/`MEDIUM`/`LOW`/`INFORMATIONAL` (mapped to legacy severity for filtering) |
| `symbol` | CSV; **intersected** with the user's monitored portfolio |
| `includeDismissed` | `true` to include dismissed |
| `unreadOnly` | `true` to exclude events this user has read |

Default: dismissed events are hidden; read events remain visible unless `unreadOnly`.

## Response item

- `id`, `symbol`, `companyName`
- `category`, `eventType`, `severity`
- `title`, `summary` (factual)
- `occurredAt`, `detectedAt`
- `significance` `{ level, reasonCodes, evidence, engineVersion, thesisRelevance: null }`
- `source` `{ type, id, url }`
- `evidence` (public blob; significance stripped)
- `thesisRelevance: null` (overlay placeholder)
- `readState` `{ isRead, readAt, isDismissed, dismissedAt }` — **this user only**

## Query plan (no N+1)

1. `PortfolioItem` symbols for `session.user.id` (`archivedAt: null`)
2. One `CompanyEvent.findMany` with `symbol IN (…)`, filters, cursor, and `userStates` **filtered by the same userId**
3. One `SymbolMaster.findMany` for page symbols (names)

Private `UserCompanyEventState` rows of other users are never selected or returned.

## Security

- Mutations require the event's symbol to be in the caller's active portfolio
- Cross-user IDOR on event state → `NOT_FOUND` / `NOT_MONITORED` (no other user's timestamps)
- Expired / unentitled sessions → `403 SUBSCRIPTION_REQUIRED` at the gate
- Shared `CompanyEvent` facts are global; personalization is only via portfolio membership + private state

## Code

- Service: `src/lib/watchtower/service.ts`
- Schemas: `src/lib/watchtower/schemas.ts`
- Tests: `tests/watchtower-backend.test.mts`
