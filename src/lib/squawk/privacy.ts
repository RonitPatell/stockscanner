/**
 * Never speak phone numbers, emails, webhook URLs, or private notes.
 * Also strips raw article dumps if they accidentally leak in.
 */

const PHONE_RE = /(?:\+?\d[\d\s().-]{8,}\d)/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const WEBHOOK_RE =
  /https?:\/\/(?:discord|hooks?|api)[^\s]*webhook[^\s]*/gi;
const URL_WITH_SECRET_RE = /https?:\/\/[^\s]+(?:token|secret|key)=[^\s]+/gi;

export function scrubForSpeech(text: string): string {
  let out = text;
  out = out.replace(EMAIL_RE, "[redacted]");
  out = out.replace(WEBHOOK_RE, "[redacted]");
  out = out.replace(URL_WITH_SECRET_RE, "[redacted]");
  out = out.replace(PHONE_RE, "[redacted]");
  // Collapse whitespace
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

export function assertNoSecretsInScript(script: string): boolean {
  if (EMAIL_RE.test(script)) return false;
  EMAIL_RE.lastIndex = 0;
  if (WEBHOOK_RE.test(script)) return false;
  WEBHOOK_RE.lastIndex = 0;
  if (PHONE_RE.test(script)) return false;
  PHONE_RE.lastIndex = 0;
  if (/discord\.com\/api\/webhooks/i.test(script)) return false;
  return true;
}

/** Drop free-form article fields — squawk must use structured inputs only. */
export function rejectRawArticleFields(input: {
  verifiedFact: string;
  aiSummary?: string | null;
  headline?: string | null;
}): string {
  // verifiedFact is the only narrative allowed; ignore aiSummary/headline body
  void input.aiSummary;
  void input.headline;
  return scrubForSpeech(input.verifiedFact).slice(0, 180);
}
