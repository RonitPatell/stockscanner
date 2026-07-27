import { createHash } from "node:crypto";
import { prisma } from "./prisma.ts";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashEmailForTrialClaim(email: string): string {
  return sha256(`email:${email.trim().toLowerCase()}`);
}

export function hashPhoneForTrialClaim(phoneDigits: string): string {
  return sha256(`phone:${phoneDigits.replace(/\D/g, "")}`);
}

/** True if this email or phone has already consumed a trial. */
export async function hasTrialClaim(opts: {
  email?: string | null;
  phoneNumber?: string | null;
}): Promise<boolean> {
  const hashes: { claimType: string; claimHash: string }[] = [];
  if (opts.email) {
    hashes.push({
      claimType: "email_hash",
      claimHash: hashEmailForTrialClaim(opts.email),
    });
  }
  if (opts.phoneNumber) {
    const digits = opts.phoneNumber.replace(/\D/g, "");
    if (digits.length >= 10) {
      hashes.push({
        claimType: "phone_hash",
        claimHash: hashPhoneForTrialClaim(digits),
      });
    }
  }
  if (hashes.length === 0) return false;

  const found = await prisma.trialClaim.findFirst({
    where: { OR: hashes },
    select: { id: true },
  });
  return !!found;
}

/** Record durable claims when a trial is started (survives account delete). */
export async function recordTrialClaims(opts: {
  email?: string | null;
  phoneNumber?: string | null;
}): Promise<void> {
  const rows: { claimType: string; claimHash: string }[] = [];
  if (opts.email) {
    rows.push({
      claimType: "email_hash",
      claimHash: hashEmailForTrialClaim(opts.email),
    });
  }
  if (opts.phoneNumber) {
    const digits = opts.phoneNumber.replace(/\D/g, "");
    if (digits.length >= 10) {
      rows.push({
        claimType: "phone_hash",
        claimHash: hashPhoneForTrialClaim(digits),
      });
    }
  }
  for (const row of rows) {
    await prisma.trialClaim
      .upsert({
        where: {
          claimType_claimHash: {
            claimType: row.claimType,
            claimHash: row.claimHash,
          },
        },
        create: row,
        update: {},
      })
      .catch(() => {});
  }
}
