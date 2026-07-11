# TrustTicker

AI Stock Catalyst Scanner — **$19.99/month** subscription SaaS.

**You pay:** ~$12/year (domain only)  
**Subscribers pay:** $19.99/month (via Stripe)

## Quick Start

```bash
npm install
copy .env.example .env
npx prisma db push
npm run dev
```

Full guide: [SETUP.md](./SETUP.md)

## Free Stack

| Service | Cost | Purpose |
|---------|------|---------|
| Vercel | $0 | Hosting |
| Neon | $0 | Database |
| Finnhub | $0 | News + quotes |
| Yahoo RSS | $0 | News fallback |
| Keyword engine | $0 | Sentiment analysis |
| Discord webhooks | $0 | Alerts |
| Stripe | $0/mo | Collects $19.99/subscriber |

## Features

- Live catalyst scanner (wire ingest + SSE stream)
- Sentiment scoring (-100 to +100) on every headline
- Float, market cap, premarket detection
- Historical similar-catalyst moves
- Discord webhook alerts
- Stripe $19.99/mo subscriptions with 7-day trial
- Advanced filters (catalyst type, urgency, sentiment)
- Watchlist briefs, playbooks, speed wins
