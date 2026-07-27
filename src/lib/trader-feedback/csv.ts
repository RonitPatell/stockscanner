import { parseDecisionRecord, createDecisionRecord } from "./record.ts";
import type { DecisionAction, DecisionReason, TraderDecisionRecord } from "./types.ts";
import { DECISION_REASONS } from "./types.ts";

const CSV_HEADERS = [
  "id",
  "action",
  "reason",
  "symbol",
  "catalystId",
  "headline",
  "decidedAt",
  "entryPrice",
  "exitPrice",
  "positionSize",
  "side",
  "alertId",
  "alertRuleId",
  "alertStrategyId",
  "reactionStage",
  "tradeability",
  "catalystAgeMin",
  "followedOwnRules",
  "mfePctAfter",
  "maePctAfter",
] as const;

function esc(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function decisionsToCsv(records: TraderDecisionRecord[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of records) {
    lines.push(
      [
        r.id,
        r.action,
        r.reason ?? "",
        r.symbol,
        r.catalystId ?? "",
        r.headline ?? "",
        r.decidedAt,
        r.entryPrice ?? "",
        r.exitPrice ?? "",
        r.positionSize ?? "",
        r.side ?? "",
        r.alertId ?? "",
        r.alertRuleId ?? "",
        r.alertStrategyId ?? "",
        r.context.reactionStage ?? "",
        r.context.tradeability ?? "",
        r.context.catalystAgeMin ?? "",
        r.context.followedOwnRules == null
          ? ""
          : r.context.followedOwnRules
            ? "true"
            : "false",
        r.mfePctAfter ?? "",
        r.maePctAfter ?? "",
      ]
        .map(esc)
        .join(",")
    );
  }
  return lines.join("\n");
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Import standardized CSV without brokerage connection.
 * Required columns: action, symbol, decidedAt (or defaults to now).
 */
export function decisionsFromCsv(csv: string): {
  records: TraderDecisionRecord[];
  errors: string[];
} {
  const errors: string[] = [];
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { records: [], errors: ["CSV needs a header and at least one row"] };
  }
  const header = parseCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name.toLowerCase());

  const records: TraderDecisionRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!);
    const get = (name: string) => {
      const j = idx(name);
      return j >= 0 ? cols[j]?.trim() ?? "" : "";
    };
    const action = get("action") as DecisionAction;
    if (
      action !== "watched" &&
      action !== "entered" &&
      action !== "skipped" &&
      action !== "ignored"
    ) {
      errors.push(`Row ${i + 1}: invalid action`);
      continue;
    }
    const symbol = get("symbol");
    if (!/^[A-Za-z]{1,5}$/.test(symbol)) {
      errors.push(`Row ${i + 1}: invalid symbol`);
      continue;
    }
    const reasonRaw = get("reason");
    const reason = DECISION_REASONS.some((r) => r.id === reasonRaw)
      ? (reasonRaw as DecisionReason)
      : null;

    const num = (name: string) => {
      const v = get(name);
      if (!v) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const record = createDecisionRecord({
      action,
      symbol,
      catalystId: get("catalystId") || null,
      headline: get("headline") || null,
      reason,
      entryPrice: num("entryPrice"),
      exitPrice: num("exitPrice"),
      positionSize: num("positionSize"),
      side:
        get("side") === "long" || get("side") === "short"
          ? (get("side") as "long" | "short")
          : null,
      alertId: get("alertId") || null,
      alertRuleId: get("alertRuleId") || null,
      alertStrategyId: get("alertStrategyId") || null,
      decidedAt: get("decidedAt") || new Date().toISOString(),
      context: {
        reactionStage: get("reactionStage") || null,
        tradeability: get("tradeability") || null,
        catalystAgeMin: num("catalystAgeMin"),
        followedOwnRules:
          get("followedOwnRules") === "true"
            ? true
            : get("followedOwnRules") === "false"
              ? false
              : null,
      },
    });
    if (get("id")) record.id = get("id");
    record.mfePctAfter = num("mfePctAfter");
    record.maePctAfter = num("maePctAfter");

    const validated = parseDecisionRecord(record);
    if (validated) records.push(validated);
    else errors.push(`Row ${i + 1}: could not parse`);
  }
  return { records, errors };
}
