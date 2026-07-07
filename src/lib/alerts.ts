export async function sendDiscordWebhook(
  webhookUrl: string,
  payload: DiscordAlertPayload
): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: `🚨 ${payload.symbol} — ${payload.sentimentLabel?.toUpperCase() || "CATALYST"}`,
            description: payload.headline,
            color: getDiscordColor(payload.sentimentScore),
            fields: [
              { name: "Price", value: `$${payload.price?.toFixed(2) || "—"}`, inline: true },
              { name: "Change", value: `${payload.changePercent?.toFixed(2) || "—"}%`, inline: true },
              { name: "Sentiment", value: `${payload.sentimentScore?.toFixed(0) || "—"}/100`, inline: true },
              { name: "Summary", value: payload.summary || "—" },
            ],
            footer: { text: "TickerTrust — Informational only, not investment advice" },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
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
}

function getDiscordColor(score?: number | null): number {
  if (score == null) return 0x6b7280;
  if (score >= 40) return 0x10b981;
  if (score <= -40) return 0xef4444;
  return 0xf59e0b;
}
