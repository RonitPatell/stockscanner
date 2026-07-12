const DISCORD_HOSTS = new Set(["discord.com", "discordapp.com"]);

/**
 * Only allow official Discord webhook URLs (blocks SSRF to internal IPs / arbitrary hosts).
 */
export function isAllowedDiscordWebhook(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true; // empty = clear webhook
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (!DISCORD_HOSTS.has(parsed.hostname)) return false;
  if (!parsed.pathname.startsWith("/api/webhooks/")) return false;
  // Path: /api/webhooks/{id}/{token}
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 4) return false;
  if (!/^\d+$/.test(parts[2])) return false;
  if (!/^[\w-]+$/.test(parts[3])) return false;
  return true;
}

export function assertDiscordWebhookOrThrow(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (!isAllowedDiscordWebhook(trimmed)) {
    throw new Error("Discord webhook must be an https://discord.com/api/webhooks/... URL");
  }
  return trimmed;
}
