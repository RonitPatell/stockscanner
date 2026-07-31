# TrustTicker — $0 to Run, $19.99/mo Revenue

**Your cost:** ~$12/year (domain only)  
**Subscriber cost:** $19.99/month (paid to you via Stripe)

---

## Cost Breakdown

| What | Your Cost | Notes |
|------|-----------|-------|
| Domain | ~$12/year | Only thing you pay for |
| Hosting (Vercel) | $0 | Free hobby tier |
| Database (Neon) | $0 | Free tier, 0.5GB |
| Market news (Finnhub) | $0 | Free, 60 calls/min |
| News fallback (Yahoo RSS) | $0 | No API key needed |
| Sentiment analysis | $0 | Built-in keyword engine |
| Discord alerts | $0 | User's own webhook |
| Stripe | $0/month | Takes ~3.6% only when you earn |
| **Total** | **~$1/mo** | Domain amortized |

**Revenue per subscriber:** $19.99/mo − ~$0.88 Stripe fee = **~$19.11 profit**

Break-even: **1 subscriber** covers everything.

---

## Production latency (required for real speed)

Vercel crons alone poll the wire **once per minute** and full ingest every **2 minutes**.
For a resilient desk, run the **priority** worker on Railway / Fly / a VPS:

```bash
# Recommended — separate adaptive schedules per source tier
npm run ingest:priority

# Legacy blended loop (defaults: 15s wire / 90s full — NOT 2s)
npm run ingest:worker

# Optional: keep quotes fresher under load
npm run quote:stream
```

See [docs/PRIORITY_INGEST.md](./docs/PRIORITY_INGEST.md) for locks, feature flags,
SEC rate limits, and honest interval guidance.

Set `FINNHUB_API_KEY` when you have one (market + company news on the wire tier).
The Trust Status bar shows **measured** wire cycle — not a hardcoded marketing number.

Without workers, expect ~60s wire cadence + publisher lag. Be honest with traders.
Do **not** claim a two-second poll unless it is explicitly configured, sustainable,
licensed, and measured.

## Public evidence demo

`/demo` is evidence-based (never fictional headlines/prices):

| Env | Default | Notes |
|-----|---------|-------|
| `DEMO_MODE` | `DELAYED_REAL` | Or `HISTORICAL_REPLAY` / `CURATED_CASES` |
| `DEMO_DELAY_MINUTES` | `30` | Delay for DELAYED_REAL (min 5) |

Admin curates cases at `/admin/demo` (`ADMIN_EMAILS`). Only SEC / issuer wires are
eligible for public redistribution; editorial text is redacted.

---

## Quick Start (30 minutes)

### 1. Install

```bash
npm install
copy .env.example .env
```

### 2. Free database (Neon)

1. Sign up at [neon.tech](https://neon.tech) — no credit card
2. Create project → copy connection string
3. Paste into `.env` as `DATABASE_URL`
4. Run: `npx prisma db push`

### 3. Generate auth secret

PowerShell:
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```
Paste result into `NEXTAUTH_SECRET` and `CRON_SECRET`.

### 4. Free market data (optional but recommended)

1. Sign up at [finnhub.io/register](https://finnhub.io/register) — no credit card
2. Copy API key → `FINNHUB_API_KEY` in `.env`

Without this key, Yahoo Finance RSS is used automatically.

### 5. Stripe ($19.99/mo subscriptions — free to set up)

1. Create account at [stripe.com](https://stripe.com)
2. **Products** → Add product: `TrustTicker Pro`
3. Price: **$19.99 / month / recurring**
4. Optional: add **7-day free trial**
5. Copy `price_...` → `STRIPE_PRICE_ID`
6. Copy API keys → `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`

Stripe costs you nothing until someone subscribes. When they do, you keep ~$19.11 of the $19.99.

### 6. Run locally

```bash
npm run dev
```

- Landing: http://localhost:3000
- Scanner: http://localhost:3000/dashboard

---

## Deploy Free (Vercel)

### 1. Push to GitHub

```bash
git add .
git commit -m "TrustTicker launch"
git push
```

### 2. Deploy

1. [vercel.com/new](https://vercel.com/new) → import repo
2. Add all `.env` variables from your `.env` file
3. Deploy (free)

### 3. Custom domain (~$12/year)

1. Buy domain at Namecheap, Cloudflare, or Google Domains
2. Vercel → Settings → Domains → add your domain
3. Update DNS records (Vercel shows exactly what to add)
4. Update env vars:
   ```
   NEXT_PUBLIC_APP_URL=https://yourdomain.com
   NEXTAUTH_URL=https://yourdomain.com
   ```

### 4. Stripe webhook (after deploy)

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://yourdomain.com/api/stripe/webhook`
3. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy signing secret → `STRIPE_WEBHOOK_SECRET` in Vercel env

### 5. Switch Stripe to live mode

When ready for real payments:
1. Complete Stripe business verification
2. Toggle from Test to Live mode
3. Replace test API keys with live keys in Vercel

---

## How the Live Feed Works (No Paid Cron)

The scanner auto-refreshes without any paid background service:

1. **Dashboard polling** — fetches new catalysts every 30 seconds
2. **SSE stream** — pushes updates to connected browsers
3. **Auto-ingest** — when data is older than 2 minutes, fresh news is pulled on the next request

**Optional free background alerts:** Use [cron-job.org](https://cron-job.org) (free) to ping every 5 minutes:
```
GET https://yourdomain.com/api/cron/ingest
Header: Authorization: Bearer YOUR_CRON_SECRET
```
This sends Discord alerts even when no one is on the dashboard.

---

## What Subscribers Get ($19.99/mo)

- Live catalyst scanner with 30s refresh
- Sentiment scoring on every headline (-100 to +100)
- Float, market cap, price, change %
- Premarket detection
- Historical similar-catalyst move data
- Discord webhook alerts
- Advanced filters (type, urgency, sentiment)
- Sound alerts for new catalysts

---

## Legal (Required Before Launch)

Built-in disclaimer pages at `/legal/disclaimer`, `/legal/terms`, `/legal/privacy`.

Before accepting real money:
1. Form an **LLC** (~$50-150 one-time, varies by state)
2. Add your business name/address to legal pages
3. Position as **informational data only** — never give buy/sell advice
4. Consult a securities attorney if unsure (~$500 for a review)

---

## Going Live Checklist

```
[ ] Domain purchased and connected
[ ] Neon database created (free)
[ ] All env vars set in Vercel
[ ] npx prisma db push run against production DB
[ ] Finnhub API key added (free)
[ ] Stripe product at $19.99/mo created
[ ] Stripe webhook configured
[ ] Test: register → subscribe (test card 4242...) → dashboard → Discord alert
[ ] Legal pages reviewed
[ ] Switch Stripe to live mode
```

---

## Scaling (multi-user production)

TrustTicker uses a **single-writer ingest pipeline** so 1 or 1,000 users read the same cached feed.

### 1. Upstash Redis (free tier)

1. Create database at [upstash.com](https://upstash.com)
2. Copy REST URL + token → `.env`:
   ```
   UPSTASH_REDIS_REST_URL="https://..."
   UPSTASH_REDIS_REST_TOKEN="..."
   ```
3. Add the same vars in Vercel → Settings → Environment Variables

### 2. Cron ingest (Vercel)

`vercel.json` runs `/api/cron/ingest` every 2 minutes. Vercel sends `Authorization: Bearer CRON_SECRET` automatically.

Ensure `CRON_SECRET` is set in Vercel env vars.

### 3. Local / always-on wire worker (required for speed)

Vercel cron alone polls wire about once per minute. For ~2s cycles:

```bash
npm run ingest:worker
```

Run this 24/7 on a cheap VPS / Railway / Fly (or your PC while testing). Free Railway/Fly tiers are enough until MRR can buy a paid wire.

On Railway there is **no `.env` file** — set variables in the Railway dashboard (`CRON_SECRET`, `NEXT_PUBLIC_APP_URL`). Do not commit `.env`. Locally, `scripts/ingest-worker.mjs` still loads `.env` if it exists.

### Realtime desk — free wires + always-on workers

Stock Titan does **not** license their internal feed. Do not scrape them.
TrustTicker uses **issuer PR wires + SEC + Finnhub + Yahoo ticker RSS + editorial RSS** (no Benzinga).

| Piece | What to buy / run | Role |
|--------|-------------------|------|
| **Always-on worker** | Railway / Fly / VPS: `npm run realtime:worker` | Priority ingest + Yahoo volume/quote stream |
| **Redis** | Upstash | Shared quote + feed cache across Vercel + workers |
| **Finnhub** | `FINNHUB_API_KEY` | Market + company news on the wire tier |

**Required env on the worker + Vercel:**

```bash
CRON_SECRET=...                 # same on Vercel + worker
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
FINNHUB_API_KEY=...             # recommended
```

**Start command (Railway/Fly):**

```bash
npm run realtime:worker
```

That runs `ingest:priority` (PR/SEC Tier 0 + Finnhub/Yahoo/editorial Tier 1) and `quote:stream`. Cursor/`npm run dev` alone will **not** keep this alive.

**Honest latency:** with the worker up, expect **tens of seconds** from publisher update on free RSS/PR wires — not a sub-second licensed newsfeed.

| Source | Cost | Role |
|--------|------|------|
| PR Newswire / Business Wire / GlobeNewswire RSS | $0 | Official press releases |
| SEC EDGAR Atom | $0 | Filings |
| Finnhub / Yahoo / MarketWatch / CNBC | $0 | Market + per-ticker + editorial |

Without `realtime:worker`, expect ~60s Vercel cron cadence and weaker volume.

### 4. Live quotes without Redis

```bash
npm run quote:stream
```

If Upstash is unset, quotes POST to `/api/quotes/ingest` (memory mode on the Next server). Fresh Upstash Redis is still better for production multi-instance.

### Architecture

- **Cron/worker** → ingests news → writes feed + quotes to Redis
- **Users** → `/api/catalysts` reads Redis only (no DB, no ingest)
- **Card expand** → `/api/catalysts/[id]` loads full summary/key points

Without Redis, dev mode uses in-memory cache + local ingest loop (single machine only).

---

## Email, push & daily briefs

### Resend (email alerts + daily briefs)

1. Sign up at [resend.com](https://resend.com) and create an API key
2. Add to `.env` and Vercel:
   ```
   RESEND_API_KEY="re_..."
   RESEND_FROM_EMAIL="TrustTicker <alerts@yourdomain.com>"
   ```
3. Verify your sending domain in Resend for production

**What sends email:**
- Catalyst alerts (when enabled in alert rules)
- Welcome email on subscription
- Morning brief (~7:30 AM ET) and EOD recap (~4:15 PM ET) via cron

### Browser push (VAPID)

VAPID keys are in `.env`. Users enable push in Settings or onboarding.

Generate new keys anytime:
```bash
npx web-push generate-vapid-keys
```

### Brief cron (Vercel)

`vercel.json` schedules:
- `GET /api/cron/briefs?kind=morning` — weekdays 12:30 UTC (~7:30 AM ET)
- `GET /api/cron/briefs?kind=eod` — weekdays 21:15 UTC (~4:15 PM ET)

Test locally:
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" "http://localhost:3000/api/cron/briefs?kind=morning"
```

---

## Revenue Math

| Subscribers | Monthly Revenue | Your Profit (after Stripe) |
|-------------|----------------|---------------------------|
| 1 | $19.99 | ~$19 |
| 10 | $199.90 | ~$191 |
| 25 | $1,000 | ~$964 |
| 50 | $2,000 | ~$1,928 |
| 100 | $4,000 | ~$3,854 |

Your only fixed cost: **~$12/year for the domain.**
