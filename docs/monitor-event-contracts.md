# TrustTicker Monitor — Event Contracts

**Status:** Design contracts for implementation. Not yet wired to production routes.  
**Versioning rule:** Every calculated payload carries `schemaVersion` + `ruleVersion` (or engine version string). Breaking changes bump major; additive fields bump minor.  
**Quality rule:** Never silently substitute missing values. Use explicit availability: `ok` | `unavailable` | `stale` | `estimated` | `verified`.

---

## 1. Existing contracts (inventory)

### 1.1 Ingest / news

| Name | Location | Key fields |
|------|----------|------------|
| `NewsArticle` | `src/types` | `id`, `symbol`, `headline`, `source`, `url`, `summary`, `publishedAt`, optional `trace` |
| Ingest trace | `ingest/annotate` | `providerItemId`, `firstFetchedAt`, `timestampQuality` |
| Idempotency key | `ingest/idempotency.ts` | Hash of provider id \| url \| title \| ticker \| 5m publish window |
| Match assessment | `coverage/match-assess.ts` | `publish` \| `quarantine` \| `reject` + confidence |

### 1.2 Catalyst / public feed

| Name | Location | Key fields |
|------|----------|------------|
| Prisma `Catalyst` | `prisma/schema.prisma` | Tape fields, `judgmentJson`, `urgencyScore`, `sentimentScore`, `quarantined`, `rawNewsId` |
| `CatalystItem` | `src/types` | Client/API catalyst DTO |
| Feed cache blob | `feed-cache.ts` | `items[]` + meta `updatedAt`, `count`, `source` |
| Catalysts SSE | `/api/catalysts/stream` | Fingerprint diffs; `Last-Event-ID`; heartbeat |

### 1.3 Quotes

| Name | Location | Key fields |
|------|----------|------------|
| `CachedQuote` | `quote-cache-service.ts` | `price`, `changePercent`, `change`, optional `volume`, `avgVolume`, `rVol`, `floatShares`, `marketCap`, `dayHigh` |
| `LiveQuote` | `LiveQuoteProvider.tsx` | Client mirror of cache |
| `StockQuote` | `types` | Stricter OHLC + required volume (provider-shaped) |
| Quotes SSE | `/api/quotes/stream` | Map of symbol → quote; polls Redis |

**Conflict note:** Prefer Monitor wire types below; adapters map from `CachedQuote` and must not coerce `unavailable` → `0` without marking `estimated`/`unavailable`.

### 1.4 Alert Backbone V2

| Name | Location | Key fields |
|------|----------|------------|
| `AlertEventEnvelope` | `alert-backbone/types.ts` | `eventId`, `version`, `phase` (`preliminary`\|`enriched`\|`expired`), `queue`, catalyst/raw ids, source tier, timestamp quality |
| Event id | `events.ts` | `evt_` + ingest idempotency key |
| Channel claim | `events.ts` | `alertbb:idemp:*` per user/channel |

Queues: `primary_filings` \| `licensed_news` \| `editorial_news` \| `market_events` \| `enrichment`.

### 1.5 Alert Strategy

| Name | Location |
|------|----------|
| `AlertStrategy` AST | `alert-strategy/types.ts` |
| Prisma `AlertStrategyVersion` | Immutable snapshot JSON |
| Delivery modes | `EARLY` \| `CONFIRMED` \| `RISK_ONLY` |

Condition fields include catalyst strength, reaction stage, tradeability, dilution, halt, RVol — **not** a momentum state machine.

### 1.6 Decision / stage / tradeability / halt / judgment

| Contract | Version string | Stages / classes |
|----------|----------------|------------------|
| Decision Card V3 | `decision-card-v3.0` | Composed model |
| Reaction stage | `reaction-stage-v1.0` | EARLY ACTIVE EXTENDED STALE UNKNOWN |
| Tradeability | `tradeability-v1.0` | LIQUID ACCEPTABLE THIN EXTREMELY_THIN UNKNOWN |
| Halt card | halt-monitor | Official codes + resume only when published |
| Judgment V2 | `judgment-v2.0` | strength, direction, risks, contributions |
| Judgment presentation | `judgment-present-v1` | materiality, direction, stage, tradeability, top risk |
| Squawk | `squawk-v1.0` | Scrubbed script + priority |
| Focus rank | `focus-mode-v1.0` / flag `v2.0` | Max 5 items |

---

## 2. Proposed Monitor contracts

Namespace prefix: `tt.monitor.*`  
Transport: JSON over SSE (v1); optional WebSocket later without changing DTO shapes.

### 2.1 Availability wrapper

```ts
type Availability = "ok" | "unavailable" | "stale" | "estimated" | "verified";

interface Field<T> {
  availability: Availability;
  value?: T;                 // omitted when unavailable
  asOf?: string;             // ISO timestamp of source observation
  source?: string;           // yahoo_poll | finnhub_ws | finnhub_rest | derived
  note?: string;             // short explain string for UI
}
```

### 2.2 `tt.monitor.market_snapshot` (ingestion → features)

```ts
interface MarketSnapshotEvent {
  schemaVersion: "monitor-market-snapshot-v1";
  symbol: string;
  sequence: number;          // monotonic per symbol in publisher
  observedAt: string;        // provider/event time when known
  ingestedAt: string;        // TrustTicker receive time
  price: Field<number>;
  changePercent: Field<number>;
  volume: Field<number>;
  avgVolume: Field<number>;
  dayHigh: Field<number>;
  dayLow: Field<number>;
  provider: "yahoo" | "finnhub" | "licensed_l1" | "mixed";
}
```

### 2.3 `tt.monitor.market_features` (feature computation)

```ts
interface MarketFeaturesEvent {
  schemaVersion: "monitor-market-features-v1";
  featureVersion: string;    // e.g. "features-v1.0"
  symbol: string;
  asOf: string;
  rVol: Field<number>;
  dollarVolume: Field<number>;
  dollarVolume1m: Field<number>;
  dollarVolume5m: Field<number>;
  sessionMovePct: Field<number>;
  rangePosition: Field<number>; // 0–1 in day range when ok
  spreadBps: Field<number>;     // unavailable unless L1 entitled
  explain: string[];            // human-readable contributions
}
```

**Forbidden inputs:** `urgencyScore`, sentiment, desk grade, Focus score.

### 2.4 `tt.monitor.momentum_state` (momentum context)

```ts
type MomentumBand =
  | "QUIET"
  | "BUILDING"
  | "ACTIVE"
  | "EXTENDED"
  | "COOLING"
  | "UNKNOWN";

interface MomentumStateEvent {
  schemaVersion: "monitor-momentum-v1";
  ruleVersion: string;       // e.g. "momentum-v1.0"
  symbol: string;
  asOf: string;
  band: MomentumBand;
  intensity: Field<number>;  // 0–100 observational only
  hysteresis: { enteredAt: string; previousBand: MomentumBand | null };
  inputsUsed: string[];      // feature keys only
  explain: string[];
  /** Explicit product copy for clients */
  disclaimer: "Observational tape intensity — not a trade recommendation";
}
```

### 2.5 `tt.monitor.attention_item` / `attention_snapshot`

```ts
interface AttentionReason {
  code: string;              // e.g. MOMENTUM_ACTIVE, CATALYST_HIGH, WATCHLIST, DILUTION_RISK
  label: string;
  weight: number;            // relative rank contribution, not expected return
}

interface AttentionItem {
  symbol: string;
  rank: number;              // 1 = top of viewport
  score: number;             // attention score only
  reasons: AttentionReason[];
  momentumBand: MomentumBand;
  catalystId?: string | null;
  riskFlags: string[];
}

interface AttentionSnapshotEvent {
  schemaVersion: "monitor-attention-v1";
  ruleVersion: string;
  asOf: string;
  items: AttentionItem[];    // bounded (e.g. ≤ 25)
  disclaimer: "Attention priority — not a recommendation";
}
```

### 2.6 `tt.monitor.catalyst_overlay`

Projects existing Judgment / Decision Card / halt / dilution into Monitor without inventing momentum.

```ts
interface CatalystOverlayEvent {
  schemaVersion: "monitor-catalyst-overlay-v1";
  catalystId: string;
  symbol: string;
  publishedAt: string;
  materiality: Field<string>;
  direction: Field<string>;
  reactionStage: Field<string>;
  tradeability: Field<string>;
  topRisk: Field<string>;
  haltActive: Field<boolean>;
  dilutionActive: Field<boolean>;
  matchConfidence: Field<number>;
  quarantined: boolean;
  judgmentVersion?: string;
  decisionCardVersion?: string;
}
```

### 2.7 `tt.monitor.delivery_envelope`

```ts
interface MonitorDeliveryEnvelope<T> {
  schemaVersion: "monitor-delivery-v1";
  eventId: string;           // ulid/uuid
  type:
    | "market_snapshot"
    | "market_features"
    | "momentum_state"
    | "attention_snapshot"
    | "catalyst_overlay"
    | "heartbeat"
    | "replay_frame";
  sequence: number;          // stream sequence
  emittedAt: string;
  payload: T;
}
```

Heartbeats: `{ type: "heartbeat", serverTime }` every ≤15s.

### 2.8 Replay frame

```ts
interface ReplayFrameEvent {
  schemaVersion: "monitor-replay-v1";
  cursor: string;
  frames: MonitorDeliveryEnvelope<unknown>[];
  complete: boolean;
}
```

---

## 3. Mapping from existing systems

| Existing | Maps to Monitor |
|----------|-----------------|
| `CachedQuote` | `MarketSnapshotEvent` via adapter (mark estimated RVol) |
| Yahoo poll / Finnhub WS | `provider` + `source` on fields |
| `computeRvol` | `MarketFeaturesEvent.rVol` (canonical) |
| Reaction stage engine | Overlay + optional Attention reason — **not** Momentum band |
| Tradeability engine | Overlay / Personalization gates |
| Halt monitor | Overlay `haltActive`; may force Momentum UI freeze label |
| Judgment present | Overlay materiality/direction/risk |
| Focus rank | Inspiration for Attention only; new ruleVersion |
| Alert Backbone envelope | Parallel channel; Monitor delivery is separate stream |
| `urgencyScore` | **Do not map** into Momentum or Features |

---

## 4. Event Tape (`monitor-event-tape-v1.0`)

| Surface | Notes |
|---------|--------|
| Domain | `src/domain/monitor/event-tape` — normalize, dedupe/cooldown/hysteresis, cluster, filter, memory retention |
| Adapter | `src/adapters/monitor/event-tape/redis-tape-store.ts` — Redis list + `ltrim` + TTL |
| API | `GET /api/monitor/event-tape` (`requirePro`, shared product tape); `POST` ingest (`authorizeCron`) |
| UI | Virtualized `EventTape` — filters All/Selected/Watchlist/Risk/Market; click → ticker + intel section |

Every item: `atMs`, `symbol`, `type`, `label`, `explanation`, `severity`, `sourceType`, `dataConfidence`. Explanations are inspection-only (no trade instructions). Retention defaults: 5_000 items / 36h.

---

## 5. SSE channel proposal (v1)

| Channel | Auth | Events |
|---------|------|--------|
| `GET /api/monitor/stream` | `requirePro` + `MONITOR_ENABLED` | delivery envelopes |
| `GET /api/monitor/snapshot` | `requirePro` | Latest attention + momentum for symbols |
| `GET /api/monitor/event-tape` | `requirePro` | Retained tape page (poll v1) |
| Admin replay | `requireAdmin` | `replay_frame` |

Reuse patterns from `/api/quotes/stream` and `/api/catalysts/stream` (poll shared cache, fingerprint, Last-Event-ID). Do not put provider keys on the client.

---

## 6. Idempotency & sequencing

| Stream | Rule |
|--------|------|
| Market snapshots | `(symbol, sequence)` monotonic; drop older sequences |
| Momentum / features | Replace by `(symbol, ruleVersion)` latest `asOf` |
| Attention snapshot | Replace entire list by `asOf` |
| Event tape | Fingerprint + cooldown/hysteresis; Redis list retention |
| Catalyst overlay | Keyed by `catalystId`; quarantine suppresses publish to Attention |

---

## 7. Explicit non-contracts (forbidden payloads)

Monitor delivery **must not** include:

- Expected profit, target price, probability of success  
- Personalized “buy” / “sell” / “enter long” instructions  
- Guaranteed latency SLAs without sample-gated production metrics  
- Raw licensed article body text on redistributed surfaces  
- Client-supplied `userId` as ownership  

---

## 8. Version bump checklist

When changing a Monitor contract:

1. Bump `schemaVersion` / `ruleVersion`  
2. Add adapter dual-read if consumers exist  
3. Update this doc + unit tests in `tests/monitor-contracts.test.mts`  
4. If trader-visible UI changes, bump `PLATFORM_GUIDE_VERSION` and `data-guide` targets  
