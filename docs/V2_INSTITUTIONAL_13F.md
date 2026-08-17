# Institutional filings (Form 13F)

Delayed SEC Form 13F-HR holdings — **not real-time**.

Engine: `src/lib/institutional/` (`INSTITUTIONAL_ENGINE_VERSION`)

## Product language

Use **Institutional filings**.  
Do not claim “smart money signal.”

Always show reporting period end + filing date.

## Data source

SEC public EDGAR only (Atom `13F-HR` + filing XML). No paid holdings API.

## Storage

- `InstitutionalHoldingSnapshot` — position rows with precomputed changeKind  
- `Institutional13fFiling` — per-accession ingest bookkeeping  

Ingest caps holdings per filing; resolves ticker via SymbolMaster names (SEC public).

## Change kinds

`new` · `increased` · `reduced` · `exited` · `unchanged` · `unknown`

Prior period = latest `reportDate` strictly before current for the same `filerCik`.

## Background ingest

- Catalyst hook (non-blocking)
- Cron: `GET/POST /api/cron/institutional-13f` (`authorizeCron`, fail-closed)

User requests only read DB (`getCompanyInstitutionalReport` / `getInstitution13fReport`).

## UI

- Ticker Ownership → Institutional filings section + delay disclosure + source links  
- `/institution/[cik]` — latest vs prior: largest new / increases / reductions / exits  

## Tests

`tests/institutional-13f.test.mts` + `tests/fixtures/form13f.ts`
