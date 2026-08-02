/**
 * Cron / worker Bearer auth — pure (no Next imports) for fail-closed gates + tests.
 */

import { timingSafeEqual } from "node:crypto";

function normalizeCronSecret(raw: string | undefined | null): string {
  return (raw ?? "")
    .trim()
    .replace(/^['"]/, "")
    .replace(/['"]$/, "")
    .trim();
}

function secretsMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Cron / worker Bearer auth — always fail closed without CRON_SECRET except local `next dev`. */
export function authorizeCron(req: Request): boolean {
  const secret = normalizeCronSecret(process.env.CRON_SECRET);
  const isLocalDev =
    process.env.NODE_ENV === "development" &&
    !process.env.VERCEL &&
    !process.env.RAILWAY_ENVIRONMENT &&
    !process.env.RAILWAY_PROJECT_ID;

  if (!secret) {
    return isLocalDev;
  }

  const auth = (req.headers.get("authorization") || "").trim();
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const alt = normalizeCronSecret(req.headers.get("x-cron-secret"));

  return secretsMatch(bearer, secret) || secretsMatch(alt, secret);
}

/** Comma-separated admin emails in ADMIN_EMAILS (case-insensitive). */
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = getAdminEmails();
  if (allow.length === 0) return false;
  return allow.includes(email.trim().toLowerCase());
}
