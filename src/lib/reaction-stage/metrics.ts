import { avail, unavailable, pctMove, distancePct } from "../decision-card/format.ts";
import { marketSessionAt } from "../latency-trace/timestamps.ts";
import { priceAtTarget, type CandleSet } from "../calibration/candles.ts";
import type {
  MarketDataMark,
  MarketSessionBucket,
  ReactionMetrics,
  ReactionStageCatalystInput,
  TimestampQualityLabel,
} from "./types.ts";

const STALE_SIM_RE =
  /\b(as\s+previously\s+(announced|reported|disclosed)|reiterates?|still\s+plans|update\s+on\s+prior|previously\s+disclosed|recycl)/i;

function sessionBucket(iso: string | null | undefined): MarketSessionBucket {
  if (!iso) return "unknown";
  const s = marketSessionAt(new Date(iso));
  if (!s) return "unknown";
  if (s === "weekend") return "weekend";
  if (s === "premarket") return "premarket";
  if (s === "regular") return "regular";
  return "afterhours";
}

function markFromQuality(
  q: "ok" | "substituted" | "delayed" | "unavailable" | undefined,
  note: string | null | undefined
): MarketDataMark {
  return {
    substituted: q === "substituted",
    delayed: q === "delayed",
    note: note ?? (q === "unavailable" ? "unavailable" : null),
  };
}

function priceField(
  value: number | null | undefined,
  quality: "ok" | "substituted" | "delayed" | "unavailable" | undefined,
  note: string | null | undefined
) {
  if (value == null || !Number.isFinite(value) || quality === "unavailable") {
    return {
      field: unavailable(note ?? "price_unavailable"),
      mark: markFromQuality("unavailable", note ?? "price_unavailable"),
    };
  }
  if (quality === "substituted") {
    return {
      field: avail(value, { estimated: true, note: note ?? "substituted_candle" }),
      mark: markFromQuality("substituted", note),
    };
  }
  if (quality === "delayed") {
    return {
      field: avail(value, { stale: true, note: note ?? "delayed_quote" }),
      mark: markFromQuality("delayed", note),
    };
  }
  return {
    field: avail(value, { note: note ?? undefined }),
    mark: markFromQuality("ok", note),
  };
}

/** Resolve publication price from explicit enrichment OR labelled candle lookup — never distant silent invent. */
function resolvePublicationPrices(
  input: ReactionStageCatalystInput
): {
  before: ReturnType<typeof priceField>;
  at: ReturnType<typeof priceField>;
} {
  const pubIso = input.providerPublishedAt;
  const bars = input.tape?.bars1m;
  if (input.priceAtPublication != null || input.priceBeforePublication != null) {
    return {
      before: priceField(
        input.priceBeforePublication,
        input.priceBeforePublicationQuality,
        input.priceBeforePublicationNote
      ),
      at: priceField(
        input.priceAtPublication,
        input.priceAtPublicationQuality,
        input.priceAtPublicationNote
      ),
    };
  }

  if (!pubIso || !bars?.length) {
    return {
      before: {
        field: unavailable("pre_publish_tape_not_stored"),
        mark: markFromQuality("unavailable", "pre_publish_tape_not_stored"),
      },
      at: {
        field: unavailable("publication_price_not_observed"),
        mark: markFromQuality("unavailable", "publication_price_not_observed"),
      },
    };
  }

  const set: CandleSet = {
    bars,
    haltWindows: input.tape?.haltWindows,
  };
  const pubSec = Math.floor(new Date(pubIso).getTime() / 1000);
  const atSnap = priceAtTarget(set, pubSec, {
    horizon: "ingest",
    maxSubstituteLagSec: 90,
  });
  const beforeSnap = priceAtTarget(set, pubSec - 60, {
    horizon: "ingest",
    maxSubstituteLagSec: 90,
  });

  return {
    before: mapCandleSnap(beforeSnap, "before_publication"),
    at: mapCandleSnap(atSnap, "at_publication"),
  };
}

function mapCandleSnap(
  snap: ReturnType<typeof priceAtTarget>,
  label: string
): ReturnType<typeof priceField> {
  if (snap.price == null || snap.quality === "MISSING" || snap.quality === "HALTED") {
    return {
      field: unavailable(snap.note ?? `${label}_${snap.quality}`),
      mark: markFromQuality("unavailable", snap.note ?? snap.quality),
    };
  }
  if (snap.substituted) {
    return priceField(snap.price, "substituted", snap.note ?? `substituted_lag_${snap.substituteLagSec}s`);
  }
  if (snap.quality === "STALE") {
    return priceField(snap.price, "delayed", snap.note ?? "stale_candle");
  }
  return priceField(snap.price, "ok", snap.note);
}

function realizedVolFromBars(
  bars: Array<{ t: number; c: number }>,
  windowSec: number,
  nowSec: number
): number | null {
  const from = nowSec - windowSec;
  const slice = bars.filter((b) => b.t >= from && b.t <= nowSec);
  if (slice.length < 3) return null;
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const a = slice[i - 1]!.c;
    const b = slice[i]!.c;
    if (a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  if (rets.length < 2) return null;
  const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
  const varSum = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length - 1);
  // Annualization omitted — report window RV in %
  return Math.sqrt(Math.max(0, varSum)) * 100;
}

/** Simple ATR% from 1m highs/lows over ~14 periods when bars present. */
export function atr14PctFromBars(
  bars: Array<{ h: number; l: number; c: number }>
): number | null {
  if (bars.length < 15) return null;
  const slice = bars.slice(-15);
  const trs: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const cur = slice[i]!;
    const prev = slice[i - 1]!;
    const tr = Math.max(
      cur.h - cur.l,
      Math.abs(cur.h - prev.c),
      Math.abs(cur.l - prev.c)
    );
    trs.push(tr);
  }
  const atr = trs.reduce((s, x) => s + x, 0) / trs.length;
  const last = slice[slice.length - 1]!.c;
  if (!(last > 0)) return null;
  return (atr / last) * 100;
}

export function computeReactionMetrics(
  input: ReactionStageCatalystInput
): ReactionMetrics {
  const nowMs = input.nowMs ?? Date.now();
  const pub = input.providerPublishedAt ?? null;
  const firstSeen = input.firstSeenAt ?? input.ingestedAt ?? null;
  const classified = input.classifiedAt ?? null;
  const delivered = input.userDeliveredAt ?? null;
  const quality = (input.timestampQuality ??
    (pub ? "ESTIMATED_PROVIDER" : "MISSING")) as TimestampQualityLabel;

  const pubPrices = resolvePublicationPrices(input);
  const ingest = priceField(
    input.priceAtIngestion,
    input.priceAtIngestionQuality,
    input.priceAtIngestionNote ??
      (input.priceAtIngestion == null ? "ingest_price_not_observed" : null)
  );
  const currentQ =
    input.tape?.quoteAgeSec != null && input.tape.quoteAgeSec > 30
      ? "delayed"
      : "ok";
  const current = priceField(
    input.tape?.currentPrice,
    input.tape?.currentPrice == null ? "unavailable" : currentQ,
    input.tape?.currentPrice == null
      ? "current_price_unavailable"
      : input.tape.quoteAgeSec != null && input.tape.quoteAgeSec > 30
        ? `quote_age_${input.tape.quoteAgeSec}s`
        : null
  );

  const bars = input.tape?.bars1m ?? [];
  const nowSec = Math.floor(nowMs / 1000);
  const rv1 =
    input.tape?.realizedVol1mPct ??
    (bars.length ? realizedVolFromBars(bars, 60, nowSec) : null);
  const rv5 =
    input.tape?.realizedVol5mPct ??
    (bars.length ? realizedVolFromBars(bars, 300, nowSec) : null);
  const atr =
    input.tape?.atr14Pct ?? (bars.length ? atr14PctFromBars(bars) : null);

  let disclosureSim = input.previousDisclosureSimilarity ?? null;
  if (disclosureSim == null) {
    const text = `${input.headline} ${input.summary ?? ""}`;
    disclosureSim = STALE_SIM_RE.test(text) ? 0.85 : null;
  }

  const age =
    pub && Number.isFinite(new Date(pub).getTime())
      ? Math.max(0, Math.round((nowMs - new Date(pub).getTime()) / 1000))
      : null;

  const rVol =
    input.tape?.rVol ??
    (input.tape?.volume != null &&
    input.tape?.avgVolume != null &&
    input.tape.avgVolume > 0
      ? input.tape.volume / input.tape.avgVolume
      : null);

  const spreadExp =
    input.tape?.spreadBps != null && input.tape?.typicalSpreadBps != null
      ? input.tape.spreadBps - input.tape.typicalSpreadBps
      : input.tape?.spreadBps != null
        ? input.tape.spreadBps
        : null;

  return {
    providerPublishedAt: pub,
    firstSeenAt: firstSeen,
    classifiedAt: classified,
    userDeliveredAt: delivered,
    priceImmediatelyBeforePublication: pubPrices.before.field,
    priceAtPublication: pubPrices.at.field,
    priceAtIngestion: ingest.field,
    currentPrice: current.field,
    pctMoveBeforePublication: pctMove(
      pubPrices.before.field.value,
      pubPrices.at.field.value
    ),
    pctMoveSincePublication: pctMove(
      pubPrices.at.field.value,
      current.field.value
    ),
    pctMoveSinceIngestion: pctMove(ingest.field.value, current.field.value),
    distanceFromVwapPct:
      input.tape?.vwap != null
        ? distancePct(input.tape.vwap, current.field.value)
        : unavailable("vwap_not_available"),
    distanceFromHodPct:
      input.tape?.dayHigh != null
        ? distancePct(input.tape.dayHigh, current.field.value)
        : unavailable("hod_not_available"),
    distanceFromPremarketHighPct:
      input.tape?.premarketHigh != null
        ? distancePct(input.tape.premarketHigh, current.field.value)
        : unavailable("premarket_high_not_available"),
    realizedVol1mPct:
      rv1 != null ? avail(rv1) : unavailable("requires_1m_bars"),
    realizedVol5mPct:
      rv5 != null ? avail(rv5) : unavailable("requires_1m_bars"),
    volumeAcceleration:
      input.tape?.volAccel != null
        ? avail(input.tape.volAccel)
        : unavailable("requires_1m_bars"),
    relativeVolume: rVol != null ? avail(rVol) : unavailable("rvol_unavailable"),
    spreadExpansionBps:
      spreadExp != null
        ? avail(spreadExp, {
            note:
              input.tape?.typicalSpreadBps == null
                ? "absolute_spread_bps_no_baseline"
                : undefined,
          })
        : unavailable("requires_l1_quote"),
    quoteFreshnessSec:
      input.tape?.quoteAgeSec != null
        ? avail(input.tape.quoteAgeSec)
        : unavailable("quote_age_unknown"),
    haltCount:
      input.tape?.haltCount != null
        ? avail(input.tape.haltCount)
        : unavailable("no_exchange_halt_feed"),
    previousDisclosureSimilarity:
      disclosureSim != null
        ? avail(disclosureSim, {
            estimated: input.previousDisclosureSimilarity == null,
            note:
              input.previousDisclosureSimilarity == null
                ? "headline_heuristic"
                : undefined,
          })
        : unavailable("no_prior_disclosure_match"),
    sourceTimestampQuality: quality,
    atr14Pct: atr != null ? avail(atr) : unavailable("requires_bars_for_atr"),
    marketSession: sessionBucket(pub ?? firstSeen),
    ageSec: age,
    marks: {
      priceBeforePublication: pubPrices.before.mark,
      priceAtPublication: pubPrices.at.mark,
      priceAtIngestion: ingest.mark,
      currentPrice: current.mark,
    },
  };
}
