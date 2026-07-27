import type { NasdaqHaltCode } from "./types.ts";

export interface HaltCodeInfo {
  code: NasdaqHaltCode;
  title: string;
  category: "news" | "volatility" | "regulatory" | "market" | "other";
  /** Plain-language what it means — no trade suggestion */
  explanation: string;
  /** Typical next codes / outcomes (informational) */
  typicalNext: string;
}

/**
 * Public-facing halt code reference (Nasdaq-oriented).
 * Educational only — not trading advice.
 */
export const NASDAQ_HALT_CODES: HaltCodeInfo[] = [
  {
    code: "T1",
    title: "Halt — news pending",
    category: "news",
    explanation:
      "Trading is paused because material news is expected. The exchange has not yet indicated that news was disseminated.",
    typicalNext: "Often moves to T2 after news is released, then a quoted resumption window.",
  },
  {
    code: "T2",
    title: "Halt — news disseminated",
    category: "news",
    explanation:
      "News related to the halt has been released. Trading remains halted until the exchange schedules and completes resumption.",
    typicalNext: "Resumption quote time may be announced; then trading can resume.",
  },
  {
    code: "T3",
    title: "Halt — news and resumption times",
    category: "news",
    explanation:
      "News has been disseminated and the exchange has published times when quoting and/or trading may resume. Times come only from the exchange — never estimated by TrustTicker.",
    typicalNext: "Quote period, then trade resumption when the exchange opens the name.",
  },
  {
    code: "T5",
    title: "Single-stock trading pause (volatility)",
    category: "volatility",
    explanation:
      "A Limit Up-Limit Down (LULD) pause: the stock moved too far too fast versus reference bands. This is a volatility pause, not necessarily a news halt.",
    typicalNext: "Short pause, then quoting/trading resumes under LULD rules unless another halt follows.",
  },
  {
    code: "T6",
    title: "Halt — extraordinary market activity",
    category: "market",
    explanation:
      "Trading paused due to extraordinary market activity. Details come from the listing exchange.",
    typicalNext: "Follow exchange status updates; do not assume a resumption clock.",
  },
  {
    code: "T8",
    title: "Halt — ETF",
    category: "market",
    explanation:
      "Halt related to an ETF (for example underlying or extraordinary conditions).",
    typicalNext: "Watch the official exchange halt status for that symbol.",
  },
  {
    code: "T12",
    title: "Halt — additional information requested",
    category: "regulatory",
    explanation:
      "Exchange requested additional information from the company. Trading remains paused until resolved.",
    typicalNext: "May extend; resumption only when the exchange says so.",
  },
  {
    code: "H4",
    title: "Halt — non-compliance",
    category: "regulatory",
    explanation: "Regulatory halt related to listing non-compliance.",
    typicalNext: "Resolved only via official exchange action.",
  },
  {
    code: "H9",
    title: "Halt — non-compliance (continued)",
    category: "regulatory",
    explanation: "Continued regulatory / non-compliance related halt.",
    typicalNext: "Official exchange notices only.",
  },
  {
    code: "H10",
    title: "Halt — SEC trading suspension",
    category: "regulatory",
    explanation: "Trading suspended under SEC authority.",
    typicalNext: "Not a routine news halt; follow SEC / exchange notices.",
  },
  {
    code: "H11",
    title: "Halt — regulatory concern",
    category: "regulatory",
    explanation: "Halt for regulatory concern as indicated by the exchange.",
    typicalNext: "Official sources only; TrustTicker does not estimate reopen times.",
  },
  {
    code: "H12",
    title: "Halt — concurrent regulatory component",
    category: "regulatory",
    explanation: "Regulatory component concurrent with another condition.",
    typicalNext: "See listing exchange halt detail.",
  },
  {
    code: "LUDP",
    title: "LULD pause",
    category: "volatility",
    explanation: "Limit Up-Limit Down pause (same family as T5-style volatility pauses).",
    typicalNext: "Typically brief; may re-trigger if volatility continues.",
  },
  {
    code: "LUDS",
    title: "LULD straddle / related",
    category: "volatility",
    explanation: "LULD-related condition reported by a market-data provider.",
    typicalNext: "Reconcile with the official exchange code when available.",
  },
];

export function normalizeHaltCode(raw: string | null | undefined): NasdaqHaltCode {
  if (!raw?.trim()) return "UNKNOWN";
  const c = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const known = NASDAQ_HALT_CODES.find((k) => k.code === c);
  if (known) return known.code;
  if (/^T\d+$/.test(c) || /^H\d+$/.test(c)) return c as NasdaqHaltCode;
  if (c.includes("LULD") || c === "LUDP" || c === "LUDS") {
    return c.startsWith("LUDS") ? "LUDS" : "LUDP";
  }
  return "OTHER";
}

export function getHaltCodeInfo(code: string): HaltCodeInfo {
  const n = normalizeHaltCode(code);
  return (
    NASDAQ_HALT_CODES.find((k) => k.code === n) ?? {
      code: n,
      title: `Halt code ${n}`,
      category: "other",
      explanation:
        "Code reported by a provider. Prefer the listing exchange’s official halt status for authoritative detail.",
      typicalNext: "Check the official exchange halt page for this symbol.",
    }
  );
}

export function codeImpliesNewsDisseminated(code: string): boolean {
  const n = normalizeHaltCode(code);
  return n === "T2" || n === "T3";
}

export function codeImpliesVolatilityPause(code: string): boolean {
  const n = normalizeHaltCode(code);
  return n === "T5" || n === "LUDP" || n === "LUDS";
}

export function codeIsRegulatory(code: string): boolean {
  const n = normalizeHaltCode(code);
  return (
    n === "T12" ||
    n === "H4" ||
    n === "H9" ||
    n === "H10" ||
    n === "H11" ||
    n === "H12"
  );
}

export const HALT_CODES_DISCLAIMER =
  "Halt codes are educational summaries of common Nasdaq / regulatory labels. TrustTicker does not suggest trades, estimate resumption times, or replace the listing exchange’s official halt status.";
