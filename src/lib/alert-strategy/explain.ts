import { evaluateStrategy } from "./evaluate.ts";
import { checkStrategyCooldown } from "./cooldown.ts";
import type {
  AlertStrategy,
  StrategyEvalFacts,
  StrategyExplainResult,
} from "./types.ts";
import type { CatalystItem } from "@/types";

/**
 * One-click “why did this alert fire?” / “why was this ticker not alerted?”
 */
export function explainStrategyMatch(
  strategy: AlertStrategy,
  facts: StrategyEvalFacts,
  catalyst?: CatalystItem | null,
  opts?: {
    userId?: string;
    nowMs?: number;
    checkCooldown?: boolean;
  }
): StrategyExplainResult {
  const evalResult = evaluateStrategy(strategy, facts, catalyst, {
    nowMs: opts?.nowMs,
  });

  const why: string[] = [];
  const whyNot: string[] = [];

  if (!strategy.enabled) {
    whyNot.push("Strategy is disabled.");
  }

  if (evalResult.blockedByMute) {
    whyNot.push(evalResult.muteReason ?? "Temporarily muted.");
  }

  for (const d of evalResult.details) {
    const line = `${d.field} ${d.op} → ${d.detail} (${d.passed ? "pass" : "fail"})`;
    if (d.passed) why.push(line);
    else whyNot.push(line);
  }

  if (opts?.checkCooldown && opts.userId) {
    const cd = checkStrategyCooldown({
      userId: opts.userId,
      strategyId: strategy.id,
      symbol: facts.symbol,
      cooldownMinutes: strategy.cooldownMinutes,
      dailyAlertCap: strategy.dailyAlertCap,
      nowMs: opts.nowMs,
    });
    if (!cd.allowed) {
      whyNot.push(cd.reason ?? "Blocked by cooldown or daily cap.");
    } else if (evalResult.matched) {
      why.push("Cooldown and daily cap allow firing.");
    }
  }

  if (evalResult.matched && why.length === 0) {
    why.push(evalResult.summary);
  }
  if (!evalResult.matched && whyNot.length === 0) {
    whyNot.push(evalResult.summary);
  }

  return {
    wouldAlert: evalResult.matched,
    why,
    whyNot,
    details: evalResult.details,
    delivery: strategy.delivery,
  };
}

/** Friendly one-liner for UI buttons */
export function explainWhyFiredPlain(result: StrategyExplainResult): string {
  if (!result.wouldAlert) {
    return `Did not alert (${result.delivery}): ${result.whyNot.slice(0, 3).join("; ") || "conditions unmet"}`;
  }
  return `Alerted (${result.delivery}): ${result.why.slice(0, 3).join("; ")}`;
}

export function explainWhyNotPlain(result: StrategyExplainResult): string {
  if (result.wouldAlert) {
    return `Would have alerted: ${result.why.slice(0, 3).join("; ")}`;
  }
  return `Not alerted: ${result.whyNot.slice(0, 5).join("; ") || "no matching conditions"}`;
}
