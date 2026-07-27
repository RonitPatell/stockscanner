import type { HaltAlertTransition, HaltRecord, HaltTransitionRecord } from "./types.ts";
import { claimHaltAlert } from "./store.ts";
import { formatResumptionTime } from "./reconcile.ts";
import { getHaltCodeInfo } from "./codes.ts";

export interface HaltAlertPayload {
  symbol: string;
  transition: HaltAlertTransition;
  haltCode: string;
  title: string;
  body: string;
  resumptionQuoteLabel: string;
  resumptionTradeLabel: string;
  playAudio: boolean;
  browserNotify: boolean;
}

export type HaltAlertHook = (payload: HaltAlertPayload) => void | Promise<void>;

const hooks: HaltAlertHook[] = [];

/** Register audio / browser notification hooks (client or server listeners). */
export function registerHaltAlertHook(hook: HaltAlertHook): () => void {
  hooks.push(hook);
  return () => {
    const i = hooks.indexOf(hook);
    if (i >= 0) hooks.splice(i, 1);
  };
}

export function __resetHaltHooksForTests(): void {
  hooks.length = 0;
}

export function buildHaltAlertPayload(
  record: HaltRecord,
  transition: HaltAlertTransition
): HaltAlertPayload {
  const info = getHaltCodeInfo(record.haltCode);
  const title = `${record.symbol} · ${transition.replace(/_/g, " ")}`;
  const body = [
    `${info.code}: ${info.title}`,
    record.haltReason ? `Reason: ${record.haltReason}` : null,
    `Quote resumption: ${formatResumptionTime(record.officialResumptionQuoteAt)}`,
    `Trade resumption: ${formatResumptionTime(record.officialResumptionTradeAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    symbol: record.symbol,
    transition,
    haltCode: record.haltCode,
    title,
    body,
    resumptionQuoteLabel: formatResumptionTime(record.officialResumptionQuoteAt),
    resumptionTradeLabel: formatResumptionTime(record.officialResumptionTradeAt),
    playAudio: true,
    browserNotify: true,
  };
}

/**
 * Emit transition alert once (duplicate suppressed).
 * Does not invent resumption times in the payload.
 */
export async function emitHaltTransitionAlert(
  record: HaltRecord,
  transition: HaltTransitionRecord
): Promise<{ emitted: boolean; payload: HaltAlertPayload | null }> {
  if (transition.suppressedDuplicate) {
    return { emitted: false, payload: null };
  }

  const claimed = await claimHaltAlert(
    record.symbol,
    transition.alertTransition,
    record.id
  );
  if (!claimed) {
    transition.suppressedDuplicate = true;
    return { emitted: false, payload: null };
  }

  const payload = buildHaltAlertPayload(record, transition.alertTransition);
  for (const hook of hooks) {
    try {
      await hook(payload);
    } catch {
      /* non-fatal */
    }
  }
  return { emitted: true, payload };
}
