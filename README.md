# TrustTicker

AI Stock Catalyst Scanner — **$40/month** subscription SaaS.

**You pay:** ~$12/year (domain only)  
**Subscribers pay:** $40/month (via Stripe)

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
| Stripe | $0/mo | Collects $40/subscriber |

## Features

- Live catalyst scanner (30s refresh + SSE stream)
- Sentiment scoring (-100 to +100) on every headline
- Float, market cap, premarket detection
- Historical similar-catalyst moves
- Discord webhook alerts
- Stripe $40/mo subscriptions with 7-day trial

## Legal

Informational only — not investment advice. See `/legal/disclaimer`.
