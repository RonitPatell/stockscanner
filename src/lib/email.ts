const FROM = process.env.RESEND_FROM_EMAIL || "TrustTicker <alerts@trustticker.app>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://trustticker.app";

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function emailShell(title: string, bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#09090b;font-family:system-ui,-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#18181b;border:1px solid #27272a;border-radius:12px;overflow:hidden">
        <tr><td style="padding:20px 24px;border-bottom:1px solid #27272a">
          <span style="color:#34d399;font-weight:700;font-size:14px">TrustTicker Pro</span>
          <span style="color:#71717a;font-size:12px;margin-left:8px">${title}</span>
        </td></tr>
        <tr><td style="padding:24px;color:#e4e4e7;font-size:14px;line-height:1.6">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #27272a;background:#0c0c0e">
          <a href="${APP_URL}/dashboard" style="color:#34d399;font-size:13px;text-decoration:none">Open live scanner →</a>
          <p style="color:#52525b;font-size:11px;margin:12px 0 0">Not financial advice · TrustTicker</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export { emailShell, APP_URL, FROM };
