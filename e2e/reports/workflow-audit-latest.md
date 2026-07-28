# TrustTicker workflow audit — Shell V3 / Feed V3 / Focus V2

Generated: 2026-07-27T22:33:46.228Z

## Verdict

**Redesign may proceed** — no P0 usability or security failures recorded.

| Severity | Count |
|----------|------:|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| Pass | 32 |

## Five usability questions

| # | Question | Expected answer in UI |
|---|----------|------------------------|
| 1 | What should the user look at first? | Connection status + Focus/top feed row (highest priority catalyst). |
| 2 | What changed recently? | Age label on the row + “Last event” in connection status. |
| 3 | Why does this event matter? | Headline / verified fact + materiality / reaction in drawer. |
| 4 | What is the primary risk? | Risk badge on row (≤3 badges) + Primary risks section in Decision Drawer. |
| 5 | What action inside the application is next? | Source / TradingView / Watchlist (W) / Focus / Risk / Review destinations. |

## P0 failures

_None._

## P1 failures

_None._

## P2 notes

_None._

## Passes

### NU-connection — Understands live connection status

- **Severity:** pass
- **Area:** new-user
- **Detail:** Live · Last event —

### NU-priority — Identifies most important catalyst

- **Severity:** pass
- **Area:** new-user
- **Detail:** Top feed row shows ABCD

### NU-drawer — Opens Decision Drawer

- **Severity:** pass
- **Area:** new-user
- **Detail:** Enter opens drawer on focused row.

### NU-source — Finds source evidence

- **Severity:** pass
- **Area:** new-user
- **Detail:** Source action visible in Decision Drawer header.

### NU-watchlist — Adds ticker to watchlist (W)

- **Severity:** pass
- **Area:** new-user
- **Detail:** W hotkey dispatched on focused row; settings API mocked.

### NU-reaction — Understands reaction stage

- **Severity:** pass
- **Area:** new-user
- **Detail:** REACTION Price at event Unavailable. Current price $1.12 Move since event Unavailable. Reaction stage Early EARLY: Critical timing/price data present; Fresh win

### NU-risk — Understands primary risk

- **Severity:** pass
- **Area:** new-user
- **Detail:** PRIMARY RISKS Registered offeringHIGH Offering / prospectus / registered-direct language present Missing critical informationMEDIUM Warrant coverage not confirm

### AQ-profit-claims — No profitability claims

- **Severity:** pass
- **Area:** quality
- **Detail:** No guaranteed profit / win-rate claims in visible copy.

### AQ-latency-claims — No unverified latency claims

- **Severity:** pass
- **Area:** quality
- **Detail:** No absolute latency guarantees in visible copy.

### AT-focus-enter — Enters Focus Mode

- **Severity:** pass
- **Area:** active-trader
- **Detail:** focus-mode-v2 visible.

### AT-jk — Navigates with j/k (drawer stays open)

- **Severity:** pass
- **Area:** active-trader
- **Detail:** Started on seed-abcd-offering; drawer remained open.

### AT-tv — Opens Source and TradingView actions

- **Severity:** pass
- **Area:** active-trader
- **Detail:** TV visible; Source visible.

### AT-squawk — Enables Squawk

- **Severity:** pass
- **Area:** active-trader
- **Detail:** focus-squawk-toggle clicked.

### AT-mute — Mutes a ticker

- **Severity:** pass
- **Area:** active-trader
- **Detail:** Muted: MRNA

### AT-exit — Exits Focus Mode

- **Severity:** pass
- **Area:** active-trader
- **Detail:** Standard destinations restored.

### RR-dilution — Finds active dilution + filing evidence

- **Severity:** pass
- **Area:** risk-review
- **Detail:** https://www.sec.gov/Archives/edgar/data/1234567/000123456724000202/424b5.htm

### RR-return — Returns to associated catalyst

- **Severity:** pass
- **Area:** risk-review
- **Detail:** Opened drawer for seed-abcd-offering

### SR-local-cloud — Understands local versus cloud storage

- **Severity:** pass
- **Area:** session-review
- **Detail:** Panel states local-by-default; sync is opt-in.

### SR-feedback — Finds local feedback

- **Severity:** pass
- **Area:** session-review
- **Detail:** ABCD skipped decision listed.

### SR-autopsy — Finds autopsy

- **Severity:** pass
- **Area:** session-review
- **Detail:** Autopsy panel opened for seeded decision.

### SR-export — Exports personal records

- **Severity:** pass
- **Area:** session-review
- **Detail:** Download: trustticker-feedback-2026-07-27.json

### SR-delete — Deletes personal records

- **Severity:** pass
- **Area:** session-review
- **Detail:** Local feedback storage cleared after DELETE confirm.

### AQ-overflow — No horizontal overflow

- **Severity:** pass
- **Area:** quality
- **Detail:** Viewport 1440 desktop project — no page-level overflow.

### AQ-scroll-traps — No nested page-level scroll traps

- **Severity:** pass
- **Area:** quality
- **Detail:** No full-viewport nested scroll containers inside main.

### AQ-modal — Accessible modals

- **Severity:** pass
- **Area:** quality
- **Detail:** Shortcuts dialog exposes role=dialog with name.

### AQ-colour-only — No colour-only statuses

- **Severity:** pass
- **Area:** quality
- **Detail:** Status dots paired with text labels.

### AQ-userid — No route trusting client userId

- **Severity:** pass
- **Area:** security
- **Detail:** POST rejected with 401.

### AQ-secrets — No private analytics fields in page

- **Severity:** pass
- **Area:** security
- **Detail:** No passwordHash / cron / stripe secret strings in HTML.

### AQ-console — No browser console errors

- **Severity:** pass
- **Area:** quality
- **Detail:** No pageerror / console.error during journeys.

### AQ-requests — No failed internal API requests

- **Severity:** pass
- **Area:** quality
- **Detail:** No 5xx / requestfailed on /api (SSE abort excluded).

### AQ-hydration — No hydration warnings

- **Severity:** pass
- **Area:** quality
- **Detail:** No hydration mismatch strings in console.

### AQ-keys — No duplicate React key warnings

- **Severity:** pass
- **Area:** quality
- **Detail:** No duplicate-key warnings observed.

## Administrative quality checks

| Check | Result |
|-------|--------|
| Browser console errors | PASS |
| Failed internal requests | PASS |
| Hydration warnings | PASS |
| Duplicate React keys | PASS |

## Screenshots

### 01-new-user-dashboard.png

![01-new-user-dashboard.png](screenshots/01-new-user-dashboard.png)

### 02-new-user-top-catalyst.png

![02-new-user-top-catalyst.png](screenshots/02-new-user-top-catalyst.png)

### 03-new-user-drawer.png

![03-new-user-drawer.png](screenshots/03-new-user-drawer.png)

### 04-active-focus.png

![04-active-focus.png](screenshots/04-active-focus.png)

### 05-active-exit-focus.png

![05-active-exit-focus.png](screenshots/05-active-exit-focus.png)

### 06-risk-dilution.png

![06-risk-dilution.png](screenshots/06-risk-dilution.png)

### 07-risk-return-catalyst.png

![07-risk-return-catalyst.png](screenshots/07-risk-return-catalyst.png)

### 08-session-review.png

![08-session-review.png](screenshots/08-session-review.png)

### 09-session-after-delete.png

![09-session-after-delete.png](screenshots/09-session-after-delete.png)

### 10-admin-quality.png

![10-admin-quality.png](screenshots/10-admin-quality.png)

## Redesign gate

Gate open: no P0 findings.
