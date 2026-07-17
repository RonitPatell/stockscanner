import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived promo capture tokens — never put CRON_SECRET in a URL.
 * Valid for the current + previous 10-minute window.
 */
export function mintPromoCaptureToken(secret: string, atMs = Date.now()): string {
  const window = Math.floor(atMs / 600_000);
  return createHmac("sha256", secret).update(`promo-capture:${window}`).digest("hex");
}

export function verifyPromoCaptureToken(
  secret: string | undefined,
  token: string | undefined
): boolean {
  if (!secret || !token || token.length < 32) return false;
  const now = Date.now();
  for (const offset of [0, -1]) {
    const expected = mintPromoCaptureToken(secret, now + offset * 600_000);
    try {
      const a = Buffer.from(token);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* continue */
    }
  }
  return false;
}
