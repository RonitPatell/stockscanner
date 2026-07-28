import type { CatalystItem } from "@/types";
import { sendEmail, emailShell } from "./email";
import { presentJudgment } from "./judgment/present";

export async function sendEmailAlert(
  to: string,
  catalyst: CatalystItem,
  ruleName?: string
): Promise<boolean> {
  const move =
    catalyst.changePercent != null
      ? `${catalyst.changePercent >= 0 ? "+" : ""}${catalyst.changePercent.toFixed(2)}%`
      : "—";
  const p = presentJudgment({ judgment: catalyst.judgmentV2 ?? null });
  const body = `
    <p style="color:#34d399;font-weight:600;margin:0 0 8px">Catalyst alert${ruleName ? ` · ${ruleName}` : ""}</p>
    <h2 style="margin:0 0 8px;font-size:20px;color:#fafafa">${catalyst.symbol}
      <span style="color:${catalyst.changePercent != null && catalyst.changePercent >= 0 ? "#34d399" : "#f87171"}">${move}</span>
    </h2>
    <p style="margin:0 0 8px;color:#a1a1aa;font-size:12px">${p.dimensionsLine}</p>
    <p style="margin:0 0 12px;color:#d4d4d8;line-height:1.5">${catalyst.headline}</p>
    ${catalyst.aiSummary ? `<p style="color:#71717a;font-size:13px;line-height:1.5">${catalyst.aiSummary.slice(0, 400)}</p>` : ""}
    <p style="color:#52525b;font-size:11px;margin-top:12px">Informational only. Direction is not a buy or sell instruction.</p>
  `;
  const subject = `[TrustTicker] ${catalyst.symbol} · ${p.materiality} · ${p.direction} — ${catalyst.headline.slice(0, 60)}`;
  return sendEmail(to, subject, emailShell("Alert", body));
}
