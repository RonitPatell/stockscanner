/**
 * Structured ops logging — JSON lines to stdout/stderr.
 * Never log secrets, password hashes, webhooks, private notes, or raw PII.
 */

export type OpsDomain =
  | "sec_ingest"
  | "event_classification"
  | "financial_normalization"
  | "capital_risk"
  | "thesis_evaluation"
  | "stripe_webhook"
  | "alerts"
  | "cron"
  | "ops";

export type OpsSeverity = "info" | "warn" | "error";

const BANNED_KEY_RE =
  /password|secret|token|webhook|authorization|cookie|phone|email|note|hash|stripe.*(key|secret)|vapid|private/i;

const REDACT = "[redacted]";

function scrubValue(key: string, value: unknown): unknown {
  if (BANNED_KEY_RE.test(key)) return REDACT;
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 240) return `${value.slice(0, 240)}…`;
    // Discord webhook URL shape
    if (/discord(?:app)?\.com\/api\/webhooks\//i.test(value)) return REDACT;
    if (/sk_live_|sk_test_|whsec_/.test(value)) return REDACT;
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v, i) => scrubValue(String(i), v));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (BANNED_KEY_RE.test(k)) {
        out[k] = REDACT;
        continue;
      }
      out[k] = scrubValue(k, v);
    }
    return out;
  }
  return String(value);
}

export function scrubOpsFields(
  fields?: Record<string, unknown> | null
): Record<string, unknown> | undefined {
  if (!fields) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = scrubValue(k, v);
  }
  return out;
}

export function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message || err.name || "error";
    return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
  }
  if (typeof err === "string") {
    return err.length > 200 ? `${err.slice(0, 200)}…` : err;
  }
  return "unknown_error";
}

/**
 * Emit one structured ops log line.
 * Prefer codes + short messages — never attach user notes or secrets.
 */
export function opsLog(input: {
  domain: OpsDomain;
  event: string;
  severity?: OpsSeverity;
  code?: string;
  message?: string;
  err?: unknown;
  fields?: Record<string, unknown>;
}): void {
  const severity = input.severity ?? "info";
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level: severity,
    domain: input.domain,
    event: input.event,
  };
  if (input.code) payload.code = input.code;
  if (input.message) payload.message = scrubValue("message", input.message);
  if (input.err != null) {
    payload.err = safeErrorMessage(input.err);
  }
  const fields = scrubOpsFields(input.fields);
  if (fields && Object.keys(fields).length > 0) payload.fields = fields;

  const line = JSON.stringify(payload);
  if (severity === "error") console.error(line);
  else if (severity === "warn") console.warn(line);
  else console.info(line);
}

export function opsFail(
  domain: OpsDomain,
  event: string,
  err: unknown,
  fields?: Record<string, unknown>
): void {
  opsLog({
    domain,
    event,
    severity: "error",
    code: "FAILURE",
    err,
    fields,
  });
}
