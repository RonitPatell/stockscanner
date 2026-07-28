import type { CatalystItem } from "@/types";
import { presentJudgment } from "./judgment/present";

/** Sends SMS via Twilio when env vars are configured. */
export async function sendSmsAlert(
  phoneNumber: string,
  catalyst: CatalystItem
): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return false;

  const chg =
    catalyst.changePercent != null
      ? `${catalyst.changePercent >= 0 ? "+" : ""}${catalyst.changePercent.toFixed(1)}%`
      : "";
  const p = presentJudgment({ judgment: catalyst.judgmentV2 ?? null });
  const body =
    `TrustTicker [${catalyst.symbol}] ${p.materiality}/${p.direction} ${catalyst.headline.slice(0, 80)} ${chg}`.trim();

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: phoneNumber.startsWith("+") ? phoneNumber : `+1${phoneNumber}`,
          From: from,
          Body: body,
        }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}
