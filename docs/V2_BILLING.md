# TrustTicker billing — trial & Stripe notes

## Trial + payment method (current behavior)

Checkout creates a Stripe **subscription** session with:

- `payment_method_types: ["card"]`
- `subscription_data.trial_period_days: 7` when the account is trial-eligible

**Result:** Stripe Checkout collects a payment method at trial start. The card is **not** charged until the trial ends (unless ineligible and billed immediately). This was **not** changed in the V2 pricing refactor.

## Entitlement

`?subscribed=true` / `billingPeriod=` on the success URL are **display-only**. Access comes from signed webhooks writing DB fields (`subscriptionStatus`, trial timestamps, etc.).

## Prices

New checkouts use only:

- `STRIPE_PRICE_ID_MONTHLY` → $19.99/mo display
- `STRIPE_PRICE_ID_ANNUAL` → $149.99/yr display

Legacy Plus/Pro price env vars may still classify **existing** subscriptions as entitled; they are not used for new Checkout line items except as temporary monthly/annual fallbacks documented in `src/lib/billing/pricing.ts`.
