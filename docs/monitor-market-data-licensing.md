# Monitor market-data licensing & redistribution

**Status: UNRESOLVED — do not assume redistribution rights.**

This document records that TrustTicker engineering has **not** completed a legal review of redistributing vendor market data (trades, NBBO, aggregates) to end-user clients.

## What the code does today

| Vendor / path | Role in adapters | Client fanout |
|---------------|------------------|---------------|
| Yahoo Finance poll (`yahoo-aggregate-adapter`) | Maps poll snapshots → `aggregate_1s` | **Not enabled** for Monitor stream until reviewed |
| Finnhub trades (`finnhub-trade-adapter`) | Maps WS/REST trade messages → `NormalizedTrade` | **Not enabled** for Monitor stream until reviewed |
| Fake provider | Tests / dry-run only | N/A |
| Official halt feeds | Halt monitor (separate package) | Status overlays only |

Existing desk paths (`/api/quotes`, quote SSE) remain governed by product ToS and prior ops practice. Monitor’s vendor-neutral layer **must not** widen redistribution without an explicit manual verification.

## Entitlements

- Plan entitlements are checked **before subscribe** (`assertSubscribeAllowed`).
- Events carry `dataEntitlement` and optional `delayedByMs`.
- Delayed data must be marked explicitly — never presented as SIP real-time without entitlement.

## Credentials

- Provider API keys stay **server-only** (`adapters/monitor/market-data/credentials.ts`).
- Never attach secrets to normalized events or JSON responses.
- Use `redactProviderSecrets` before any debug echo.

## Manual verification checklist (owner: legal / founder)

- [ ] Yahoo Terms of Use — redistribution of quotes/aggregates to paying users  
- [ ] Finnhub plan — redistributable trades / quotes vs display-only  
- [ ] Any future SIP / Polygon / licensed L1 — exhibit A entitlements  
- [ ] Delayed vs real-time labeling requirements  
- [ ] Demo / public surfaces (`demo/licensing.ts`) stay redacted for editorial/licensed text  

Until boxes are checked, Monitor delivery to browsers should prefer **derived features / momentum state** computed server-side, not raw SIP/NBBO passthrough.

## Related

- `docs/monitor-architecture.md` §6  
- `docs/REALTIME_DESK.md`  
- `src/lib/demo/licensing.ts`  
- `src/lib/tradeability/entitlements.ts` (`MARKET_DATA_L1_LICENSED`)  
