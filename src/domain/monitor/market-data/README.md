# Monitor market-data (domain)

Vendor-neutral US equities event contracts, validation, sequencing, entitlements, and ingest pipeline.

**Allowed imports:** other pure domain modules, `zod`.  
**Forbidden:** React, Prisma, Redis, Stripe, `next/*`, browser APIs, route handlers.

Adapters: `src/adapters/monitor/market-data/`.  
Licensing: `docs/monitor-market-data-licensing.md`.  
Tests: `tests/monitor-market-data.test.mts`.
