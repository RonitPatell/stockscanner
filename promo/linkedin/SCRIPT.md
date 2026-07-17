# TrustTicker — LinkedIn Epic Demo Video

**Files:**
- `videos/trustticker-linkedin-epic.mp4` · 1920×1080 · 30fps · ~61s · silent (kinetic captions)
- `videos/trustticker-linkedin-epic-short.mp4` · same look · **~25s** feed cut (prefer this for organic LinkedIn)

Built with Remotion (`promo/linkedin/remotion/`) from real TradingDashboard screenshots
(`promo/linkedin/shots/`, captured via `capture-desk.mjs` against `/promo/desk-capture`).
Capture polish forces live status, seeded catches board, and a filled Watchlist Autopsy so
promo frames never show “Starting” / “Loading autopsy…”.

## Scene timeline — epic (~61s)

| Time | Scene | On-screen |
| --- | --- | --- |
| 0:00 | Cold open — void, particles, grid | MARKET NEWS MOVES **FAST** |
| 0:02 | Cold open beat 2 | MOST DESKS DROWN IN **TABS** |
| 0:04 | Logo slam — shockwave, glitch, light streaks | TrustTicker · The market-news workspace |
| 0:07 | Real desk flies in on a 3D plane from deep space | ONE **DESK** — The actual TrustTicker Pro workspace |
| 0:15 | Wire alerts dolly-in (neon-highlighted panel) | THE **WIRE** — Halts · highs of day · volume surges |
| 0:23 | Live news feed dolly-in | LIVE **FEED** — Every catalyst, scored and timestamped |
| 0:31 | Heavy volume dolly-in | HEAVY **VOLUME** — rVol leaders surface before they trend |
| 0:39 | Judgment tools dolly-in | **FOCUS** TOOLS — Dilution · calls · edge · replay |
| 0:47 | 3D finale — desk layers separate in space | **WIRE · FEED · FOCUS** → ONE **DESK** |
| 0:54 | End card — halo ring, feature chips | trustticker.com · Not financial advice · Data illustrative |

## Scene timeline — short (~25s)

| Time | Scene | On-screen |
| --- | --- | --- |
| 0:00 | Cold open (one beat) | MARKET NEWS MOVES **FAST** |
| 0:01.5 | Logo slam | TrustTicker |
| 0:03.5 | Hero desk | ONE **DESK** |
| 0:07 | Wire | THE **WIRE** |
| 0:11 | Feed | LIVE **FEED** |
| 0:14.5 | Volume | HEAVY **VOLUME** |
| 0:18 | Finale | **WIRE · FEED · FOCUS** → ONE **DESK** |
| 0:21 | End card | trustticker.com |

**Cover frame tip (LinkedIn):** scrub to ~1.5s (logo) or ~3.5s (desk reveal) before posting.

## Re-render

```powershell
# 1. Capture fresh desk shots (dev server running, CRON_SECRET in .env)
node --env-file=.env promo/linkedin/capture-desk.mjs
Copy-Item promo/linkedin/shots/*.png promo/linkedin/remotion/public/shots/ -Force

# 2. Render
cd promo/linkedin/remotion
npm run render         # -> out/trustticker-epic.mp4 (~61s)
npm run render:short   # -> out/trustticker-epic-short.mp4 (~25s)
Copy-Item out\*.mp4 ..\videos\ -Force
```

## LinkedIn post draft

Market news moves fast. Most desks drown in tabs.

We built TrustTicker so the whole picture lives on one screen — this is the actual Pro workspace, not a mockup:

- **The wire** — halts, highs of day, and volume surges, timestamped as they print
- **A live catalyst feed** — every headline scored, clustered, and sourced
- **Heavy-volume leaders** — relative volume ranked in real time
- **Focus tools** — dilution radar, a call board with no hindsight edits, and a daily edge recap

No hype, no tips — a calmer way to follow the market while you work.

See it live at trustticker.com — the demo and the daily briefing are free, no account needed.

Informational only · Not financial advice · Data shown is illustrative

#fintech #marketnews #productivity #SaaS #productdemo

## Optional VO script (~55s, calm read)

> Market news moves fast — and most desks drown in browser tabs.
>
> TrustTicker puts the whole picture on one screen. The wire surfaces halts, highs of day, and volume surges the moment they print. A live feed scores and clusters every catalyst, with the context right next to the story. Heavy-volume leaders are ranked in real time. And when you need judgment, not just speed — dilution radar, a call board, and a daily edge recap are one click away.
>
> Wire. Feed. Focus. One desk.
>
> See it live at trustticker dot com.
>
> Informational only. Not financial advice.
