# Watchtower

Portfolio-scoped **What Changed** feed — backend + primary desk UI.

> Answers: *What materially changed across the companies I monitor?*  
> Review priority only — never buy/sell advice.

## UI

- Primary nav: **Portfolio · Watchtower · Research · Discover**
- Component: `src/components/dashboard-shell/WatchtowerDesk.tsx`
- Detail drawer: `WatchtowerEventDrawer.tsx`
- Deep link: `/dashboard?view=watchtower&eventId=…`
- Markets / Structure remain deep-link only (`?view=markets` / `?view=structure`)

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
| `significance` | CSV of `HIGH`/`MEDIUM`/`LOW`/`INFORMATIONAL` |
| `symbol` | CSV; **intersected** with the user's monitored portfolio |
| `includeDismissed` | `true` to include dismissed |
| `unreadOnly` | `true` to exclude events this user has read |

## Response item

- `id`, `symbol`, `companyName`
- `category`, `eventType`, `severity`
- `title`, `summary` (factual)
- `occurredAt`, `detectedAt`
- `significance` `{ level, reasonCodes, evidence, engineVersion, thesisRelevance: null }`
- `source` `{ type, id, url }`
- `evidence` (public blob; significance stripped)
- `thesisRelevance: null`
- `readState` `{ isRead, readAt, isDismissed, dismissedAt }` — **this user only**

## Security

- Mutations require the event's symbol in the caller's active portfolio
- Cross-user IDOR blocked on private read/dismiss state
- View source opens only allowlisted `http(s)` URLs

## Code

- Service: `src/lib/watchtower/service.ts`
- UI helpers: `src/lib/watchtower/ui.ts`
- Tests: `tests/watchtower-backend.test.mts`, `tests/watchtower-ui.test.mts`, `e2e/watchtower.spec.ts`
