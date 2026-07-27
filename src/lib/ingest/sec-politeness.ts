import { rateLimit } from "../rate-limit.ts";

/**
 * SEC fair-access compliance helpers.
 * Aggregate request rate must stay below 10 req/s.
 * Declared User-Agent must include company name + contact.
 */
export const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT?.trim() ||
  "TrustTicker contact@trustticker.com (https://www.trustticker.com)";

/** Hard ceiling: 8 requests / rolling 1s window (below SEC's 10/s guidance). */
const SEC_MAX_PER_SEC = Number(process.env.SEC_MAX_RPS ?? "8");
const SEC_WINDOW_MS = 1_000;

export async function acquireSecRequestPermit(): Promise<{
  ok: boolean;
  retryAfterMs: number;
}> {
  const max = Number.isFinite(SEC_MAX_PER_SEC)
    ? Math.min(9, Math.max(1, Math.floor(SEC_MAX_PER_SEC)))
    : 8;
  const result = await rateLimit("ingest:sec:aggregate", max, SEC_WINDOW_MS, {
    strict: true,
  });
  if (result.ok) return { ok: true, retryAfterMs: 0 };
  return {
    ok: false,
    retryAfterMs: Math.max(50, result.resetAt - Date.now()),
  };
}

/** Wait briefly for a SEC permit (bounded). */
export async function waitForSecPermit(maxWaitMs = 2_000): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const permit = await acquireSecRequestPermit();
    if (permit.ok) return true;
    await new Promise((r) =>
      setTimeout(r, Math.min(permit.retryAfterMs || 100, deadline - Date.now()))
    );
  }
  return false;
}
