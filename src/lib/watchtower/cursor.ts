/**
 * Opaque cursor for Watchtower feed pagination.
 * Sort key: occurredAt DESC, id DESC.
 */

export type WatchtowerCursorPayload = {
  occurredAt: string;
  id: string;
};

export function encodeWatchtowerCursor(payload: WatchtowerCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeWatchtowerCursor(
  raw: string | undefined | null
): WatchtowerCursorPayload | null {
  if (!raw || !raw.trim()) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as WatchtowerCursorPayload).occurredAt !== "string" ||
      typeof (parsed as WatchtowerCursorPayload).id !== "string"
    ) {
      return null;
    }
    const occurredAt = (parsed as WatchtowerCursorPayload).occurredAt;
    const id = (parsed as WatchtowerCursorPayload).id;
    if (Number.isNaN(new Date(occurredAt).getTime()) || !id) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
}
