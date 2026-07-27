import { rejectRawArticleFields, scrubForSpeech } from "./privacy.ts";
import {
  applyPronunciationDictionary,
  pronounceSymbol,
} from "./pronunciation.ts";
import type { SquawkScriptInput } from "./types.ts";

function fmtMove(pct: number | null): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  const sign = pct >= 0 ? "up" : "down";
  return `${sign} ${Math.abs(pct).toFixed(1)} percent since publication`;
}

function fmtRvol(r: number | null): string | null {
  if (r == null || !Number.isFinite(r)) return null;
  return `relative volume ${r.toFixed(1)}`;
}

/**
 * Max two-sentence script from structured fields only.
 * Never includes raw article text, phone, email, webhook, or private notes.
 */
export function buildSquawkScript(input: SquawkScriptInput): string {
  // Explicitly ignore secrets / raw article
  void input.phoneNumber;
  void input.email;
  void input.webhookUrl;
  void input.privateNote;

  const fact = rejectRawArticleFields({
    verifiedFact: input.verifiedFact,
    aiSummary: input.aiSummary,
    headline: input.headline,
  });

  const symbolSay = pronounceSymbol(input.symbol);
  const move = fmtMove(input.moveSincePublicationPct);
  const rvol = fmtRvol(input.rVol);
  const trade = input.tradeability
    ? `tradeability ${scrubForSpeech(input.tradeability)}`
    : null;
  const risk = input.highestRisk
    ? `highest risk: ${scrubForSpeech(input.highestRisk)}`
    : null;

  const sentence1 = scrubForSpeech(
    `${symbolSay}. ${fact}. Source quality ${scrubForSpeech(input.sourceQuality)}.`
  );

  const bits = [move, rvol, trade, risk].filter(Boolean);
  const sentence2 = bits.length
    ? scrubForSpeech(`${bits.join(". ")}.`)
    : "";

  let script = sentence2 ? `${sentence1} ${sentence2}` : sentence1;
  script = applyPronunciationDictionary(script);

  // Hard cap ~2 sentences / length
  const parts = script.split(/(?<=\.)\s+/).filter(Boolean).slice(0, 2);
  return parts.join(" ").slice(0, 320);
}
