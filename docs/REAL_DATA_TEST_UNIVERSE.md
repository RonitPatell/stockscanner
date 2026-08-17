# Real-Data Test Universe

**Phase:** 4 — Representative public companies for local certification  
**Date:** 2026-08-17  
**Purpose:** Controlled manual/local hydration — **not** CI network dependency.

Run hydration: `npm run hydrate -- SYMBOL`  
Inspect readiness: open Research or `GET /api/research/SYMBOL/readiness` (entitled enqueue).

---

## Universe

| Symbol | Company | CIK (SEC) | Profile | Expected datasets |
|--------|---------|-----------|---------|-------------------|
| **RKLB** | Rocket Lab USA, Inc. | 0001819994 | Defense/aerospace · small/mid cap · frequent 8-K/Form 4 | **FINANCIALS proven** · Capital · Insiders · Filings · Events · State |
| **AAPL** | Apple Inc. | 0000320193 | Mega-cap technology · rich CompanyFacts · steady 10-Q/K | Full financials · Capital (buybacks/shelf) · Insiders · 13D/G rare · 13F delayed |
| **MSFT** | Microsoft Corp. | 0000789019 | Mega-cap software · strong XBRL | Same as mega-cap baseline |
| **JPM** | JPMorgan Chase & Co. | 0000019617 | Large bank · financial facts differ (NII, provisions) | Financials (bank shape) · Capital · Filings · may have sparse margin metrics |
| **CAT** | Caterpillar Inc. | 0000018230 | Industrial · cyclical revenue | Financials · Capital · Insiders · Ownership |
| **LMT** | Lockheed Martin Corp. | 0000936468 | Defense prime · government revenue mix | Financials · Capital · Filings |
| **TSLA** | Tesla, Inc. | 0001318605 | Auto/manufacturing · high attention · Form 4 activity | Financials · Capital · Insiders · Events |
| **MRNA** | Moderna, Inc. | 0001682852 | Biotech · revenue volatility post-COVID | Financials · Capital (shelf/ATM possible) · Insiders |
| **PLUG** | Plug Power Inc. | 0001093691 | Pre-profit / financing-heavy small cap | Capital emphasis · burn/runway · dilution filings |
| **MDB** | MongoDB, Inc. | 0001441816 | SaaS · Dec fiscal year (non-calendar) | Financials period alignment · QoQ/YoY comparability |
| **WMT** | Walmart Inc. | 0000104169 | Retail mega-cap · Jan fiscal year | Fiscal boundary / 53-week edge cases |
| **BRK.B** | Berkshire Hathaway (class B) | 0001067983 | Conglomerate · mapping alias stress | Identity normalization · financials breadth |

---

## Usage rules

1. **Do not** hardcode company-specific parser exceptions for these tickers in production code.
2. **Do not** assume every dataset has qualifying records — mark `CONFIRMED_EMPTY` when indexed and empty.
3. **Respect** SEC politeness (`waitForSecPermit`) — run hydrations sequentially in manual certification.
4. **Persist** to local/dev DB only — never production without operator intent.
5. After manual runs, **capture fixtures** from observed outputs for CI regression (Phase 7+).

---

## Certification matrix columns (Phase 37)

For each symbol record: Identity · Financials · Quarterly Delta · Company State · Capital · Insiders · 13D/G · 13F · Filings · What Changed · Timeline.

Status values: `PASS` · `CONFIRMED_EMPTY` · `PARTIAL` · `UNSUPPORTED` · `FAIL`.

---

## Priority order for first real-data pass

1. RKLB (regression anchor — financials already proven in architecture docs)
2. AAPL (mega-cap sanity)
3. PLUG (financing-heavy small cap)
4. MDB (non-calendar fiscal year)
5. JPM (bank fact shapes)
