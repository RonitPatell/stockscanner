import { prisma } from "../prisma.ts";
import { sendDiscordWebhook } from "../alerts.ts";
import { normalizeAlertRules } from "../alert-rules.ts";
import { sendEmail, emailShell } from "../email.ts";
import type { DilutionInstrumentType } from "./types.ts";
import { INSTRUMENT_LABELS } from "./types.ts";

/**
 * RISK_ONLY dilution alerts with evidence links.
 * Targets Pro users with an enabled RISK_ONLY alert rule.
 */
const recent = new Map<string, number>();

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function dispatchDilutionRiskAlerts(opts?: {
  sinceHours?: number;
}): Promise<number> {
  const since = new Date(Date.now() - (opts?.sinceHours ?? 6) * 3600_000);
  const instruments = await prisma.dilutionInstrument.findMany({
    where: {
      createdAt: { gte: since },
      confidence: { gte: 45 },
      instrumentType: { notIn: ["AMENDMENT"] },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  if (instruments.length === 0) return 0;

  const users = await prisma.user.findMany({
    where: {
      OR: [{ subscriptionStatus: "active" }, { subscriptionStatus: "trialing" }],
    },
    select: {
      id: true,
      email: true,
      watchlist: true,
      alertRules: true,
      discordWebhook: true,
      discordAlertsEnabled: true,
      emailAlertsEnabled: true,
    },
    take: 300,
  });

  let sent = 0;
  for (const inst of instruments) {
    const label =
      INSTRUMENT_LABELS[inst.instrumentType as DilutionInstrumentType] ||
      inst.instrumentType;
    const cooldownKey = `dilution:${inst.symbol}:${inst.instrumentType}:${inst.accessionNumber ?? ""}`;
    const last = recent.get(cooldownKey) ?? 0;
    if (Date.now() - last < 30 * 60_000) continue;
    recent.set(cooldownKey, Date.now());

    const evidence = inst.sourceUrl
      ? `Evidence: ${inst.sourceUrl}`
      : "Evidence: SEC filing (URL missing)";
    const capacity =
      inst.capacityKind === "registration_capacity"
        ? "Registration capacity (not a confirmed sale)."
        : inst.capacityKind === "atm_availability"
          ? "ATM availability (not confirmed issuance)."
          : inst.capacityKind === "announced_sale"
            ? "Announced sale — verify settlement."
            : inst.capacityKind === "confirmed_issuance"
              ? "Filing language suggests confirmed issuance."
              : "";
    const dil =
      inst.potentialDilutionPct != null
        ? `Potential dilution ~${inst.potentialDilutionPct}% (${inst.estimateLabel} — labeled estimate only).`
        : `Dilution % unavailable (${inst.estimateLabel}).`;

    const body = [
      `RISK_ONLY · ${inst.symbol} · ${label}`,
      capacity,
      dil,
      `Status: ${inst.status} · confidence ${Math.round(inst.confidence)}`,
      evidence,
      inst.evidenceSnippets[0] ? `Snippet: ${inst.evidenceSnippets[0]}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    for (const user of users) {
      const rules = normalizeAlertRules(user.alertRules);
      const riskRules = rules.filter(
        (r) => r.enabled && r.mode === "RISK_ONLY"
      );
      if (riskRules.length === 0) continue;

      const watch = new Set(user.watchlist.map((s) => s.toUpperCase()));
      const inScope = riskRules.some(
        (r) => r.scope === "any" || watch.has(inst.symbol)
      );
      if (!inScope) continue;

      const channels = new Set(riskRules.flatMap((r) => r.channels));

      if (
        channels.has("discord") &&
        user.discordAlertsEnabled &&
        user.discordWebhook
      ) {
        const ok = await sendDiscordWebhook(user.discordWebhook, {
          symbol: inst.symbol,
          headline: `RISK_ONLY: ${label}`,
          summary: body.slice(0, 500),
          sentimentScore: -60,
          sentimentLabel: "bearish",
          price: null,
          changePercent: null,
        });
        if (ok) sent++;
      }

      if (
        channels.has("email") &&
        user.emailAlertsEnabled &&
        user.email &&
        process.env.RESEND_API_KEY
      ) {
        const html = emailShell(
          "Dilution risk",
          `<pre style="white-space:pre-wrap;font-size:13px;color:#e4e4e7">${escapeHtml(body)}</pre>
           ${
             inst.sourceUrl
               ? `<p><a href="${escapeHtml(inst.sourceUrl)}" style="color:#34d399">Open SEC evidence</a></p>`
               : ""
           }`
        );
        const ok = await sendEmail(
          user.email,
          `TrustTicker RISK_ONLY · ${inst.symbol} ${label}`,
          html
        );
        if (ok) sent++;
      }
    }
  }

  return sent;
}
