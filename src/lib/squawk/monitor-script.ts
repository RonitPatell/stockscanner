import { scrubForSpeech } from "./privacy.ts";
import {
  applyPronunciationDictionary,
  pronounceSymbol,
} from "./pronunciation.ts";

/**
 * Monitor squawk script input — structured fields only.
 * Never includes raw article text, private notes, contacts, or webhooks.
 */
export interface MonitorSquawkScriptInput {
  symbol: string;
  /** Short event phrase, e.g. "Verified contract announcement" or "halted" */
  eventPhrase: string;
  momentumState?: string | null;
  /** Primary risk or tradeability warning — never a trade instruction */
  riskOrTradeability?: string | null;
}

const FORBIDDEN =
  /\b(buy|sell|long|short|enter|exit|expected return|probability of success|target price)\b/i;

/**
 * Default Monitor format:
 * "[Ticker]. [Event]. [Momentum state]. [Primary risk or tradeability warning]."
 * Maximum two short sentences.
 */
export function buildMonitorSquawkScript(
  input: MonitorSquawkScriptInput
): string {
  const symbolSay = pronounceSymbol(input.symbol);
  const event = scrubForSpeech(input.eventPhrase).slice(0, 120);
  const momentum = input.momentumState
    ? scrubForSpeech(
        input.momentumState.replace(/_/g, " ").toLowerCase()
      ).slice(0, 60)
    : null;
  const warning = input.riskOrTradeability
    ? scrubForSpeech(input.riskOrTradeability).slice(0, 100)
    : null;

  // Compact halt-style: "RBNE halted. Offering news…"
  const eventIsVerb =
    /^(halted|resumed|resumption scheduled)$/i.test(event.trim()) ||
    event.trim().toLowerCase().startsWith("halted");

  let sentence1: string;
  if (eventIsVerb && !momentum) {
    sentence1 = `${symbolSay} ${event}.`;
  } else {
    // One sentence: ticker + event + optional momentum (comma-joined to stay ≤2 total).
    const mom = momentum
      ? momentum.startsWith("momentum")
        ? momentum
        : `momentum ${momentum}`
      : null;
    sentence1 = mom
      ? `${symbolSay}. ${event}, ${mom}.`
      : `${symbolSay}. ${event}.`;
  }

  // Sentence 2 — risk / tradeability warning only.
  const sentence2 = warning ? `${warning.replace(/\.$/, "")}.` : "";

  let script = sentence2
    ? `${scrubForSpeech(sentence1)} ${scrubForSpeech(sentence2)}`
    : scrubForSpeech(sentence1);

  script = applyPronunciationDictionary(script);

  // Hard drop if somehow trade language leaked
  if (FORBIDDEN.test(script)) {
    script = script.replace(FORBIDDEN, "").replace(/\s+/g, " ").trim();
  }

  return script.replace(/\s+/g, " ").trim().slice(0, 280);
}
