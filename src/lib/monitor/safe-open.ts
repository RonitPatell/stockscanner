import { safeHttpUrl } from "@/lib/utils";

/** Open only http(s) URLs — blocks javascript:/data:/etc. */
export function openSafeHttpUrl(url: string | null | undefined): boolean {
  const safe = safeHttpUrl(url);
  if (!safe || typeof window === "undefined") return false;
  window.open(safe, "_blank", "noopener,noreferrer");
  return true;
}

export { safeHttpUrl };
