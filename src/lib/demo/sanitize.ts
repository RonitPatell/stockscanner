import type {
  DemoGuidedSequence,
  DemoMode,
  DemoPriceCheckpoint,
  PublicDemoRecord,
} from "./types.ts";
import { isRedistributionPermitted, mustRedactLicensedText } from "./licensing.ts";

const PRIVATE_KEYS = [
  "userId",
  "email",
  "passwordHash",
  "discordWebhook",
  "phoneNumber",
  "pushSubscription",
  "stripeCustomerId",
  "subscriptionId",
  "password",
  "webhook",
] as const;

export type CatalystDemoRow = {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  sourceUrl: string | null;
  publishedAt: Date;
  createdAt: Date;
  catalystType: string | null;
  aiSummary: string | null;
  keyPoints: string[];
  setupTags: string[];
  price: number | null;
  changePercent: number | null;
  floatShares: number | null;
  marketCap: number | null;
  urgencyScore: number | null;
  verifiedConfidence: number | null;
  sourceTier: string | null;
  isPremarket: boolean;
};

function categoryLabel(type: string | null): string {
  if (!type) return "Catalyst";
  return type.replace(/_/g, " ");
}

function eventDateLabel(d: Date): string {
  return d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildEvidence(row: CatalystDemoRow, redacted: boolean): string[] {
  const out: string[] = [];
  if (row.catalystType) out.push(`Category: ${categoryLabel(row.catalystType)}`);
  if (row.sourceTier) out.push(`Source tier: ${row.sourceTier}`);
  if (row.floatShares != null) {
    const m = row.floatShares / 1e6;
    out.push(`Float at ingest: ${m >= 1 ? `${m.toFixed(1)}M` : row.floatShares.toLocaleString()} shares`);
  }
  if (row.marketCap != null) {
    const b = row.marketCap / 1e9;
    out.push(`Market cap context: ${b >= 1 ? `$${b.toFixed(1)}B` : `$${(row.marketCap / 1e6).toFixed(0)}M`}`);
  }
  if (row.isPremarket) out.push("Session: premarket");
  if (row.urgencyScore != null) out.push(`Urgency score: ${Math.round(row.urgencyScore)}`);
  if (row.verifiedConfidence != null) {
    out.push(`Verification confidence: ${Math.round(row.verifiedConfidence)}`);
  }
  if (row.setupTags.length) out.push(`Setup tags: ${row.setupTags.slice(0, 4).join(", ")}`);
  if (!redacted && row.keyPoints?.length) {
    // Only non-redacted (permitted redistribution) may include key points derived in-product
    for (const kp of row.keyPoints.slice(0, 3)) {
      if (kp && !/webhook|phone|email|password/i.test(kp)) out.push(kp.slice(0, 160));
    }
  }
  return out.slice(0, 8);
}

function buildRiskFlags(row: CatalystDemoRow): string[] {
  const flags: string[] = [];
  const h = row.headline.toLowerCase();
  if (/\b(offering|atm|dilution|prospectus|424b5|secondary)\b/i.test(h)) {
    flags.push("Dilution / offering language");
  }
  if (/\b(investigation|subpoena|doj|sec charges|bankruptcy|going concern)\b/i.test(h)) {
    flags.push("Legal / distress risk");
  }
  if ((row.floatShares ?? Infinity) < 20_000_000) flags.push("Low float — gap risk");
  if ((row.changePercent ?? 0) >= 15) flags.push("Already extended at ingest");
  if (row.catalystType === "macro") flags.push("Roundup / multi-name — weaker single-name edge");
  if (flags.length === 0) flags.push("No automated trap flags — still verify the filing");
  return flags.slice(0, 5);
}

function buildGuided(row: CatalystDemoRow, redacted: boolean): DemoGuidedSequence {
  const type = categoryLabel(row.catalystType);
  const move =
    row.changePercent != null
      ? `${row.changePercent >= 0 ? "+" : ""}${row.changePercent.toFixed(1)}% at ingest`
      : "move at ingest unavailable";

  const whatHappened = redacted
    ? `${row.symbol} had a ${type} headline from ${row.source}. Licensed article text is redacted; open the source link for the publisher’s wording.`
    : `${row.symbol}: ${row.headline.slice(0, 180)}`;

  const whyItMattered = [
    `Category ${type} can reprice expectations quickly when the tape is thin.`,
    row.sourceTier === "wire" || isRedistributionPermitted(row.source)
      ? "Came over a first-party / SEC-style wire — often the earliest public stamp."
      : "Came via an aggregator — treat timing as delayed vs the original publisher.",
  ].join(" ");

  const trapRisks = buildRiskFlags(row).join("; ");

  const howItReacted =
    row.changePercent != null
      ? `Price context at TrustTicker ingest: ${move}${
          row.price != null ? ` ($${row.price.toFixed(2)})` : ""
        }. Later checkpoints appear when recorded on curated cases.`
      : "Price at ingest was not recorded for this row; reaction is shown only when checkpoints exist.";

  return { whatHappened, whyItMattered, trapRisks, howItReacted };
}

function sanitizeHeadline(headline: string): string {
  return headline.replace(/\s+/g, " ").trim().slice(0, 280);
}

function safeSourceUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Assert object has no private keys (for tests + defense in depth). */
export function assertNoPrivateFields(payload: unknown, path = "root"): void {
  if (payload == null) return;
  if (Array.isArray(payload)) {
    payload.forEach((v, i) => assertNoPrivateFields(v, `${path}[${i}]`));
    return;
  }
  if (typeof payload !== "object") return;
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    const lower = k.toLowerCase();
    for (const banned of PRIVATE_KEYS) {
      if (lower === banned.toLowerCase() || lower.includes("webhook") || lower.includes("password")) {
        throw new Error(`Private field leaked at ${path}.${k}`);
      }
    }
    assertNoPrivateFields(v, `${path}.${k}`);
  }
}

export function toPublicDemoRecord(
  row: CatalystDemoRow,
  mode: DemoMode,
  checkpoints: DemoPriceCheckpoint[] = []
): PublicDemoRecord {
  const permitted = isRedistributionPermitted(row.source);
  const redacted = mustRedactLicensedText(row.source);

  // Never ship AI summary body for licensed/editorial sources on the public demo
  const guided = buildGuided(row, redacted);
  if (!redacted && row.aiSummary && permitted) {
    // Permitted wires only: one short product sentence, still not a full PR dump
    guided.whatHappened = `${sanitizeHeadline(row.headline)}`;
  }

  return {
    id: row.id,
    mode,
    symbol: row.symbol.toUpperCase().slice(0, 8),
    headline: sanitizeHeadline(row.headline),
    source: row.source,
    sourceUrl: safeSourceUrl(row.sourceUrl),
    catalystType: row.catalystType,
    category: categoryLabel(row.catalystType),
    publishedAt: row.publishedAt.toISOString(),
    ingestedAt: row.createdAt.toISOString(),
    eventDateLabel: eventDateLabel(row.publishedAt),
    priceAtIngest: row.price,
    changePercentAtIngest: row.changePercent,
    priceCheckpoints: checkpoints,
    evidence: buildEvidence(row, redacted),
    riskFlags: buildRiskFlags(row),
    guided,
    textRedacted: redacted,
    redistributionPermitted: permitted,
  };
}

/** Strip prohibited licensed free-text fields from a curated case before public return. */
export function redactCuratedIfNeeded(record: PublicDemoRecord): PublicDemoRecord {
  if (!mustRedactLicensedText(record.source)) return record;
  return {
    ...record,
    textRedacted: true,
    redistributionPermitted: false,
    evidence: record.evidence.filter(
      (e) => !/summary|said |according to|exclusive/i.test(e)
    ),
    guided: {
      ...record.guided,
      whatHappened: `${record.symbol} ${record.category} event from ${record.source}. Full publisher text is redacted — use the source link.`,
    },
  };
}
