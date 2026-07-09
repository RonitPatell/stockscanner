import type { WatchlistBrief } from "@/types";
import { sendEmail, emailShell, APP_URL } from "./email";

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function briefSectionHtml(brief: WatchlistBrief): string {
  const parts: string[] = [
    `<p style="color:#a1a1aa;margin:0 0 16px">${brief.summary}</p>`,
    `<p style="color:#71717a;font-size:12px;margin:0 0 20px">Watchlist: ${brief.watchlist.join(", ")}</p>`,
  ];

  for (const section of brief.sections) {
    if (!section.items.length) continue;
    parts.push(`<h3 style="color:#fafafa;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em">${section.title}</h3>`);
    parts.push('<table width="100%" style="margin-bottom:20px;border-collapse:collapse">');
    for (const item of section.items.slice(0, 8)) {
      const color = (item.changePercent ?? 0) >= 0 ? "#34d399" : "#f87171";
      parts.push(`
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #27272a;vertical-align:top;width:56px">
            <strong style="color:#fafafa;font-family:monospace">${item.symbol}</strong>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #27272a;color:#a1a1aa;font-size:13px">${item.headline.slice(0, 100)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #27272a;text-align:right;font-family:monospace;color:${color};width:64px">${fmtPct(item.changePercent)}</td>
        </tr>`);
    }
    parts.push("</table>");
  }

  parts.push(
    `<a href="${APP_URL}/dashboard" style="display:inline-block;background:#059669;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Open scanner</a>`
  );

  return parts.join("");
}

export async function sendDailyBriefEmail(
  to: string,
  brief: WatchlistBrief
): Promise<boolean> {
  const label = brief.kind === "eod" ? "EOD Recap" : "Morning Brief";
  const subject = `TrustTicker ${label} — ${brief.watchlist.slice(0, 3).join(", ")}${brief.watchlist.length > 3 ? "…" : ""}`;
  const html = emailShell(label, briefSectionHtml(brief));
  return sendEmail(to, subject, html);
}

export async function sendWelcomeEmail(to: string, name?: string | null): Promise<boolean> {
  const greeting = name ? `Hey ${name.split(" ")[0]},` : "Hey,";
  const body = `
    <h2 style="color:#fafafa;margin:0 0 12px;font-size:20px">Welcome to TrustTicker Pro</h2>
    <p style="color:#a1a1aa;margin:0 0 16px">${greeting} your live catalyst scanner is ready. Here's what you get:</p>
    <ul style="color:#d4d4d8;margin:0 0 20px;padding-left:20px;line-height:1.8">
      <li>Near-real-time wire ingest (~8s) with SSE push</li>
      <li>Story clustering, setup tags, and catalyst playbooks</li>
      <li>Premarket command center + morning/EOD email briefs</li>
      <li>Pro alert rules — Discord, email, SMS, and browser push</li>
    </ul>
    <p style="color:#a1a1aa;margin:0 0 16px">Set your watchlist and alert channels in Settings — takes about 60 seconds.</p>
    <a href="${APP_URL}/dashboard" style="display:inline-block;background:#059669;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Launch scanner</a>
  `;
  return sendEmail(to, "Welcome to TrustTicker Pro — you're in", emailShell("Welcome", body));
}
