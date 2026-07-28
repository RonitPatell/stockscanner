import { isAllowedDiscordWebhook } from "@/lib/discord-webhook";
import { presentJudgment } from "@/lib/judgment/present";
import type { JudgmentV2 } from "@/lib/judgment/types";

export async function sendDiscordWebhook(
  webhookUrl: string,
  payload: DiscordAlertPayload
): Promise<boolean> {
  try {
    if (!isAllowedDiscordWebhook(webhookUrl)) {
      console.error("Blocked non-Discord webhook URL");
      return false;
    }
    const presented = presentJudgment({
      judgment: payload.judgmentV2 ?? null,
      directionalImplication: payload.directionalImplication,
      catalystStrength: payload.catalystStrength,
    });
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: `🔔 ${payload.symbol} — ${presented.materiality} · ${presented.direction}`,
            description: payload.headline,
            color: getDiscordColor(presented.direction, payload.sentimentScore),
            fields: [
              {
                name: "Price",
                value: `$${payload.price?.toFixed(2) || "—"}`,
                inline: true,
              },
              {
                name: "Change",
                value: `${payload.changePercent?.toFixed(2) || "—"}%`,
                inline: true,
              },
              {
                name: "Materiality",
                value: presented.materiality,
                inline: true,
              },
              {
                name: "Direction",
                value: presented.direction,
                inline: true,
              },
              {
                name: "Tradeability",
                value: presented.tradeability,
                inline: true,
              },
              {
                name: "Risk",
                value: presented.topRisk ?? "None flagged",
                inline: true,
              },
              { name: "Summary", value: payload.summary || "—" },
            ],
            footer: {
              text: "TrustTicker — Informational only. Direction ≠ buy/sell instruction.",
            },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch (err) {
    console.error("Discord webhook failed:", err);
    return false;
  }
}

interface DiscordAlertPayload {
  symbol: string;
  headline: string;
  summary?: string | null;
  sentimentScore?: number | null;
  sentimentLabel?: string | null;
  price?: number | null;
  changePercent?: number | null;
  judgmentV2?: JudgmentV2 | null;
  catalystStrength?: string | null;
  directionalImplication?: string | null;
}

function getDiscordColor(direction: string, score?: number | null): number {
  if (direction === "Positive") return 0x10b981;
  if (direction === "Negative") return 0xef4444;
  if (direction === "Mixed") return 0xf59e0b;
  if (score == null) return 0x6b7280;
  if (score >= 40) return 0x10b981;
  if (score <= -40) return 0xef4444;
  return 0xf59e0b;
}
