# Data readiness launch audit

Question: can a new subscriber search a real US company and get useful Research data without a live SEC fetch during page render?

## Surfaces

| Surface | Grade | Notes |
|---|---|---|
| Search | PASS | Entitled Research open calls `GET /api/research/[symbol]/readiness`. |
| Identity / CIK | PASS | `resolveCompanyIdentity` → SymbolMaster + SEC company_tickers. Status READY / NOT_FOUND / NO_CIK / ERROR. |
| Coverage | PASS | `RESEARCH_INTEREST` coverage; Portfolio not required. |
| Hydration request | PASS | Unique `CompanyHydrationJob` per symbol; rate-limited. Public/expired inspect-only. |
| Job execution | PASS | `/api/cron/hydrate` + `npm run hydrate -- SYM` reuse `hydrateCompanySymbol`. |
| Financials | PASS | CompanyFacts ingest + Quarterly Delta; Preparing vs Unavailable vs Error banners. |
| Quarterly Delta | PASS | Period-comparable YoY; incompatible windows stay unavailable. |
| Capital | PASS | Independent liquidity / shares / financing cards; Unknown explains why. |
| Insiders | PASS | Form 4 persist or legitimate empty/unavailable. |
| Ownership | PARTIAL | 13D/G from submissions window; 13F remains cron-only. |
| Filings | PASS | Bounded 10-Q/10-K section persist. |
| Readiness UI | PASS | PROCESSING / ERROR / UNSUPPORTED / READY — not a single “No data.” |
| Retry | PASS | Backoff `nextEligibleAt`; admin retry + entitled re-open after backoff. |
| Local workflow | PASS | `npm run hydrate -- RKLB` (Vercel cron does not run in `next dev`). |
| Production cron | PASS | `vercel.json` hydrate every 2 minutes; same domain services. |

## Launch-blocking FAILs found in this pass

None remaining after wiring identity → coverage → enqueue → cron/CLI hydrate → Research banners.

## Residual risks (not FAIL)

- Prisma generate on Windows can EPERM if `next dev` locks the query engine — stop the dev server, then `npx prisma generate && npx prisma db push`.
- 13F stays STALE/MISSING until the dedicated cron.
- A company with no CIK is NO_CIK / UNSUPPORTED, not silently empty.
