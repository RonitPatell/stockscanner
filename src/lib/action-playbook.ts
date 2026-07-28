import type { CatalystItem } from "@/types";

export type ActionBias = "long" | "short" | "watch" | "avoid";

export interface ActionPlaybook {
  bias: ActionBias;
  action: string;
  invalidation: string;
  why: string;
  risk: string;
  conviction: number;
  label: string;
  /**
   * 0 = calm / tradeable with plan
   * 100 = maximum FOMO trap — do not chase
   */
  antiFomoScore: number;
  antiFomoLabel: string;
}

const OFFERING_TYPES = new Set(["offering", "dilution"]);
const BULL_TYPES = new Set([
  "fda",
  "contract",
  "earnings",
  "upgrade",
  "partnership",
  "buyback",
  "merger",
]);
const BEAR_TYPES = new Set(["downgrade", "lawsuit", "investigation", "bankruptcy"]);

const DILUTION_RE =
  /\b(offering|dilut|atm offering|registered direct|public offering|secondary offering|bought deal|share issuance|prospectus\s+supplement|424\s*b\s*5|424b5|shelf\s+registration|form\s*s-1|form\s*s-3|s-1\/a|s-3\/a|equity\s+purchase\s+agreement|convertible\s+(note|preferred|debenture)|warrant\s+reprice|reverse\s+split|at[\s-]?the[\s-]?market)\b/i;

export function isDilutionCatalyst(
  c: Pick<CatalystItem, "catalystType" | "headline">
): boolean {
  const type = (c.catalystType ?? "").toLowerCase();
  if (OFFERING_TYPES.has(type)) return true;
  const headline = c.headline ?? "";
  if (DILUTION_RE.test(headline)) return true;
  // SEC capital-form headlines even when catalystType was forced to sec_filing
  if (
    /\b(424B5 prospectus|S-1 registration|S-3 shelf|S-1\/A amendment|S-3\/A amendment)\b/i.test(
      headline
    )
  ) {
    return true;
  }
  return false;
}

function hasTag(tags: string[] | undefined, needle: string): boolean {
  return (tags ?? []).some((t) => t.toLowerCase().includes(needle));
}

function fomoLabel(score: number): string {
  if (score >= 75) return "FOMO trap";
  if (score >= 55) return "High FOMO";
  if (score >= 35) return "Caution";
  return "Clear head";
}

function withFomo(
  base: Omit<ActionPlaybook, "antiFomoScore" | "antiFomoLabel">,
  antiFomoScore: number
): ActionPlaybook {
  const score = Math.max(0, Math.min(100, Math.round(antiFomoScore)));
  return { ...base, antiFomoScore: score, antiFomoLabel: fomoLabel(score) };
}

/**
 * Deterministic action card — judgment + anti-FOMO is the $20 edge.
 */
export function buildActionPlaybook(
  c: Pick<
    CatalystItem,
    | "catalystType"
    | "sentimentScore"
    | "setupTags"
    | "changePercent"
    | "urgencyScore"
    | "headline"
    | "relatedSymbols"
    | "floatShares"
    | "rVol"
  >
): ActionPlaybook {
  const type = (c.catalystType ?? "other").toLowerCase();
  const score = c.sentimentScore ?? 0;
  const move = Math.abs(c.changePercent ?? 0);
  const signedMove = c.changePercent ?? 0;
  const urgency = c.urgencyScore ?? 0;
  const headline = (c.headline ?? "").toLowerCase();
  const tags = c.setupTags ?? [];
  const related = (c.relatedSymbols ?? []).slice(0, 3);
  const lowFloat =
    c.floatShares != null && c.floatShares > 0 && c.floatShares < 20_000_000;
  const heavyVol = (c.rVol != null && c.rVol >= 3) || hasTag(tags, "heavy");
  const extended = move >= 12;

  if (isDilutionCatalyst(c) || DILUTION_RE.test(headline)) {
    return withFomo(
      {
        bias: "avoid",
        label: "Capital caution",
        action: "Do not chase the spike. Wait for offering price discovery or stand aside.",
        invalidation: "Only reconsider if price reclaims VWAP on declining dilution headlines.",
        why: "Offerings are usually dilutive — early longs get trapped after the print.",
        risk: "Low-float names can still rip into the offering — treat as capital risk.",
        conviction: 82,
      },
      88 + (extended ? 8 : 0) + (lowFloat ? 4 : 0)
    );
  }

  if (BEAR_TYPES.has(type) || score <= -40) {
    return withFomo(
      {
        bias: "short",
        label: "Negative direction",
        action: "Look for failed reclaim of the news spike; watch strength for confirmation, not panic chase.",
        invalidation: "Invalid if price holds above pre-news VWAP with rising volume.",
        why: `Bearish catalyst (${type}) with sentiment ${score}.`,
        risk: "Short squeezes on low float — use hard stops if you engage.",
        conviction: Math.min(90, 50 + Math.abs(score) / 3 + urgency / 5),
      },
      40 + (extended ? 25 : 0) + (lowFloat ? 15 : 0)
    );
  }

  if (
    (BULL_TYPES.has(type) || score >= 35) &&
    (signedMove >= 2 || urgency >= 40 || heavyVol)
  ) {
    const sympathy =
      related.length > 0
        ? ` Watch sympathy: ${related.join(", ")}.`
        : lowFloat
          ? " Low float — expect violence both ways."
          : "";
    return withFomo(
      {
        bias: "long",
        label: "Positive direction",
        action: `Review with the news impulse only on strength (HOD hold / VWAP reclaim).${sympathy}`,
        invalidation: "Invalid if it loses the first pullback low or VWAP with expanding volume against.",
        why: `${type} catalyst, sentiment ${score}, move ${signedMove >= 0 ? "+" : ""}${signedMove.toFixed(1)}%.`,
        risk: heavyVol
          ? "Relative volume is elevated — spreads and slippage will be worse."
          : "Without volume confirmation, headline fades are common.",
        conviction: Math.min(92, 45 + score / 3 + Math.min(move, 15) + (heavyVol ? 10 : 0)),
      },
      25 + (extended ? 35 : 0) + (lowFloat ? 20 : 0) + (heavyVol && extended ? 15 : 0)
    );
  }

  if (type === "macro" || related.length >= 2) {
    return withFomo(
      {
        bias: "watch",
        label: "Watch / map",
        action: `Map the names, don't force a single-stock chase. Focus: ${(related.length ? related : ["leaders in the headline"]).join(", ")}.`,
        invalidation: "Skip if you can't isolate one clean ticker with volume.",
        why: "Multi-name / macro story — edge is selection, not speed alone.",
        risk: "Roundups create FOMO across weak names.",
        conviction: 40,
      },
      55 + (extended ? 15 : 0)
    );
  }

  return withFomo(
    {
      bias: "watch",
      label: "Watch first",
      action: "Let the first 1–5 minutes print. Only engage on a clear level (VWAP / HOD / opening range).",
      invalidation: "No trade if the move is already extended without a pullback.",
      why: "Catalyst is mixed or early — speed without a plan is gambling.",
      risk: "Chasing mid-candle after the headline is how $20 accounts die.",
      conviction: 35,
    },
    30 + (extended ? 40 : 0) + (urgency > 70 ? 15 : 0)
  );
}

export function actionBiasClass(bias: ActionBias): string {
  switch (bias) {
    case "long":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "short":
      return "border-red-500/40 bg-red-500/10 text-red-300";
    case "avoid":
      return "border-amber-500/40 bg-amber-500/10 text-amber-200";
    default:
      return "border-zinc-600/50 bg-zinc-800/60 text-zinc-300";
  }
}

export function antiFomoClass(score: number): string {
  if (score >= 75) return "text-amber-300 bg-amber-500/15 border-amber-500/40";
  if (score >= 55) return "text-orange-300 bg-orange-500/10 border-orange-500/30";
  if (score >= 35) return "text-zinc-300 bg-zinc-800 border-zinc-600";
  return "text-emerald-300 bg-emerald-500/10 border-emerald-500/30";
}
