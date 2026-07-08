# TrustTicker — $0 to Run, $40/mo Revenue

**Your cost:** ~$12/year (domain only)  
**Subscriber cost:** $40/month (paid to you via Stripe)

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

**Revenue per subscriber:** $40/mo − ~$1.46 Stripe fee = **~$38.54 profit**

Break-even: **1 subscriber** covers everything.

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

### 5. Stripe ($40/mo subscriptions — free to set up)

1. Create account at [stripe.com](https://stripe.com)
2. **Products** → Add product: `TrustTicker Pro`
3. Price: **$40.00 / month / recurring**
4. Optional: add **7-day free trial**
5. Copy `price_...` → `STRIPE_PRICE_ID`
6. Copy API keys → `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`

Stripe costs you nothing until someone subscribes. When they do, you keep ~$38.54 of the $40.

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

## What Subscribers Get ($40/mo)

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
[ ] Stripe product at $40/mo created
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

### 3. Local dev worker (optional)

With Redis configured but no Vercel cron locally:

```bash
npm run ingest:worker
```

This hits `/api/cron/ingest` every 30s.

### Architecture

- **Cron/worker** → ingests news → writes feed + quotes to Redis
- **Users** → `/api/catalysts` reads Redis only (no DB, no ingest)
- **Card expand** → `/api/catalysts/[id]` loads full summary/key points

Without Redis, dev mode uses in-memory cache + local ingest loop (single machine only).

---

## Revenue Math

| Subscribers | Monthly Revenue | Your Profit (after Stripe) |
|-------------|----------------|---------------------------|
| 1 | $40 | ~$38 |
| 10 | $400 | ~$385 |
| 25 | $1,000 | ~$964 |
| 50 | $2,000 | ~$1,928 |
| 100 | $4,000 | ~$3,854 |

Your only fixed cost: **~$12/year for the domain.**
