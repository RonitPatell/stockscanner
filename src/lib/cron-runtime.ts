/**
 * Helpers for Vercel-compatible cron handlers.
 * Vercel freezes the isolate after the response — fire-and-forget work is unsafe there.
 */

/** True when this invocation should await work before responding. */
export function shouldAwaitCronWork(req: Request): boolean {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("await") === "1") return true;
    if (url.searchParams.get("await") === "0") return false;
  } catch {
    /* ignore */
  }
  // Vercel / Railway serverless HTTP — complete work inside maxDuration.
  if (process.env.VERCEL) return true;
  // Local always-on workers prefer fast 202-style "started" + background.
  return false;
}

/** Soft deadline helper — leave headroom before platform kill. */
export function cronDeadlineMs(
  maxDurationSec: number,
  headroomSec = 8
): number {
  const budget = Math.max(5, maxDurationSec - headroomSec) * 1000;
  return Date.now() + budget;
}

export function pastDeadline(deadlineMs: number): boolean {
  return Date.now() >= deadlineMs;
}
