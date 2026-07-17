import { createHash } from "node:crypto";
import type { CatalystItem } from "@/types";

/** Compact fingerprint so SSE clients only re-render when the feed actually changed. */
export function feedFingerprint(items: CatalystItem[]): string {
  const h = createHash("sha1");
  for (const c of items) {
    h.update(c.id);
    h.update("|");
    h.update(c.symbol);
    h.update("|");
    h.update(c.publishedAt ?? "");
    h.update("|");
    h.update(String(c.changePercent ?? ""));
    h.update("|");
    h.update(String(c.price ?? ""));
    h.update("|");
    h.update(c.headline?.slice(0, 48) ?? "");
    h.update("\n");
  }
  return h.digest("hex").slice(0, 16);
}
