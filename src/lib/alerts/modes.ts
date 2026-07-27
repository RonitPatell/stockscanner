import type { CatalystItem } from "@/types";
import type { AlertMode } from "../coverage/types.ts";

export interface AlertCondition {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface AlertModeEvaluation {
  mode: AlertMode;
  wouldFire: boolean;
  triggered: AlertCondition[];
  blocked: AlertCondition[];
}

export interface AlertModeContext {
  changePercent?: number | null;
  rVol?: number | null;
  spreadPct?: number | null;
  dollarVolume?: number | null;
  minConfirmedChange?: number;
  minConfirmedRvol?: number;
  maxSpreadPct?: number;
  minDollarVolume?: number;
  staleHours?: number;
}

const STALE_TRAP =
  /\b(as\s+previously\s+(announced|reported|disclosed)|reiterates?|still\s+plans|update\s+on\s+prior|previously\s+disclosed)\b/i;

export function detectRiskOnlyCatalyst(c: CatalystItem): {
  isRisk: boolean;
  tags: string[];
} {
  const tags: string[] = [];
  const text = `${c.headline} ${c.aiSummary ?? ""} ${(c.keyPoints ?? []).join(" ")}`;
  const type = (c.catalystType ?? "").toLowerCase();

  if (type.includes("offering") || /\boffering\b/i.test(text)) tags.push("offering");
  if (/\bdilut/i.test(text) || type.includes("dilution")) tags.push("dilution");
  if (/reverse\s+split/i.test(text)) tags.push("reverse_split");
  if (/\bwarrant/i.test(text)) tags.push("warrant");
  if (/convertible/i.test(text)) tags.push("convertible_debt");
  if (
    /424b|prospectus|s-3|s-1|atm\b|shelf\s+registration|registered\s+direct/i.test(
      text
    ) ||
    (type === "sec_filing" && /424|s-1|s-3|prospectus/i.test(c.headline))
  ) {
    tags.push("prospectus");
  }
  if (/sec\s+investigation|doj|fraud|restatement|delist|compliance/i.test(text)) {
    tags.push("negative_regulatory");
  }
  if (STALE_TRAP.test(text)) tags.push("stale_news_trap");
  if (c.setupTags?.some((t) => /dilution|offering|trap/i.test(t))) {
    tags.push("setup_tag_risk");
  }
  if (
    tags.length === 0 &&
    /\b(offering|dilution|warrant|convertible|reverse\s+split)\b/i.test(text)
  ) {
    tags.push("risk_language");
  }

  return { isRisk: tags.length > 0, tags };
}

export function isStaleStory(
  publishedAt: string | Date | null | undefined,
  staleHours = 6
): boolean {
  if (!publishedAt) return false;
  const t = new Date(publishedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t > staleHours * 3600_000;
}

function cond(
  id: string,
  label: string,
  passed: boolean,
  detail?: string
): AlertCondition {
  return { id, label, passed, detail };
}

/**
 * Evaluate EARLY / CONFIRMED / RISK_ONLY.
 * Returns every condition that triggered or blocked the alert.
 */
export function evaluateAlertMode(
  mode: AlertMode,
  catalyst: CatalystItem,
  ctx: AlertModeContext = {}
): AlertModeEvaluation {
  const checks: AlertCondition[] = [];
  const change = Math.abs(ctx.changePercent ?? catalyst.changePercent ?? 0);
  const rvol = ctx.rVol ?? catalyst.rVol ?? 0;
  const confidence = catalyst.verifiedConfidence ?? 0;
  const urgency = catalyst.urgencyScore ?? 0;
  const quarantined = Boolean(
    (catalyst as CatalystItem & { quarantined?: boolean }).quarantined
  );
  const staleHours = ctx.staleHours ?? 6;
  const stale = isStaleStory(catalyst.publishedAt, staleHours);
  const risk = detectRiskOnlyCatalyst(catalyst);

  const minConfChange = ctx.minConfirmedChange ?? 2.5;
  const minConfRvol = ctx.minConfirmedRvol ?? 2.0;
  const maxSpread = ctx.maxSpreadPct ?? 2.5;
  const minDollarVol = ctx.minDollarVolume ?? 250_000;

  checks.push(
    cond("not_quarantined", "Not quarantined", !quarantined, quarantined ? "held back" : undefined)
  );
  checks.push(cond("has_headline", "Has catalyst headline", Boolean(catalyst.headline)));

  if (mode === "EARLY") {
    checks.push(
      cond(
        "high_match_confidence",
        "High-confidence ticker match (≥45)",
        confidence >= 45,
        `confidence=${confidence}`
      )
    );
    const material =
      urgency >= 25 ||
      Boolean(catalyst.catalystType) ||
      /\b(8-k|fda|earnings|merger|acquisition|offering|approval)\b/i.test(
        catalyst.headline
      );
    checks.push(
      cond(
        "material_catalyst",
        "Material catalyst (no price confirmation required)",
        material,
        catalyst.catalystType ? `type=${catalyst.catalystType}` : `urgency=${urgency}`
      )
    );
    checks.push(
      cond(
        "no_price_required",
        "EARLY: price confirmation not required",
        true,
        `change%=${change}`
      )
    );
    if (stale && STALE_TRAP.test(catalyst.headline)) {
      checks.push(
        cond(
          "not_stale_trap",
          "Not a stale-news trap",
          false,
          `age>${staleHours}h + prior-disclosure language`
        )
      );
    }
  }

  if (mode === "CONFIRMED") {
    checks.push(
      cond("match_confidence", "Match confidence ≥40", confidence >= 40, `confidence=${confidence}`)
    );
    checks.push(
      cond(
        "price_confirmation",
        `Price move ≥${minConfChange}%`,
        change >= minConfChange,
        `abs(change%)=${change}`
      )
    );
    checks.push(
      cond(
        "volume_confirmation",
        `Relative volume ≥${minConfRvol}`,
        rvol >= minConfRvol,
        `rvol=${rvol}`
      )
    );

    if (ctx.spreadPct != null) {
      checks.push(
        cond(
          "spread_ok",
          `Spread ≤${maxSpread}%`,
          ctx.spreadPct <= maxSpread,
          `spread%=${ctx.spreadPct}`
        )
      );
    } else {
      checks.push(
        cond(
          "spread_ok",
          "Spread check skipped (no spread data)",
          true,
          "we do not invent spreads"
        )
      );
    }

    const price = catalyst.price ?? 0;
    const vol = catalyst.volume ?? 0;
    const dollar =
      ctx.dollarVolume != null
        ? ctx.dollarVolume
        : price > 0 && vol > 0
          ? price * vol
          : null;
    if (dollar != null) {
      checks.push(
        cond(
          "liquidity_ok",
          `Dollar volume ≥$${minDollarVol.toLocaleString()}`,
          dollar >= minDollarVol,
          `dollarVolume=${Math.round(dollar)}`
        )
      );
    } else {
      checks.push(
        cond("liquidity_ok", "Liquidity check skipped (no volume)", true, "honest skip")
      );
    }
  }

  if (mode === "RISK_ONLY") {
    checks.push(
      cond(
        "risk_event",
        "Offerings / dilution / warrants / convertibles / negative regulatory / stale traps",
        risk.isRisk,
        risk.tags.join(",") || "none"
      )
    );
    checks.push(
      cond("min_confidence", "Match confidence ≥30", confidence >= 30, `confidence=${confidence}`)
    );
  }

  const triggered = checks.filter((c) => c.passed);
  const blocked = checks.filter((c) => !c.passed);

  let wouldFire = blocked.length === 0;
  if (wouldFire) {
    if (mode === "EARLY") {
      wouldFire =
        checks.some((c) => c.id === "high_match_confidence" && c.passed) &&
        checks.some((c) => c.id === "material_catalyst" && c.passed);
    } else if (mode === "CONFIRMED") {
      wouldFire =
        checks.some((c) => c.id === "price_confirmation" && c.passed) &&
        checks.some((c) => c.id === "volume_confirmation" && c.passed) &&
        checks.some((c) => c.id === "match_confidence" && c.passed);
    } else {
      wouldFire =
        checks.some((c) => c.id === "risk_event" && c.passed) &&
        checks.some((c) => c.id === "min_confidence" && c.passed);
    }
  }

  return { mode, wouldFire, triggered, blocked };
}

export function previewAlertModes(
  catalyst: CatalystItem,
  ctx: AlertModeContext = {}
): AlertModeEvaluation[] {
  return (["EARLY", "CONFIRMED", "RISK_ONLY"] as AlertMode[]).map((mode) =>
    evaluateAlertMode(mode, catalyst, ctx)
  );
}
