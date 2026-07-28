/** Focus Mode V2 — minimal live-trading surface. */

export function isFocusModeV2Enabled(): boolean {
  const raw =
    process.env.NEXT_PUBLIC_FOCUS_MODE_V2 ??
    process.env.FOCUS_MODE_V2 ??
    "";
  const v = raw.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  // Visible in local/dev by default with Shell V3; production requires opt-in.
  return process.env.NODE_ENV === "development";
}

export const FOCUS_MODE_V2_FLAG = "focusModeV2";
export const FOCUS_MODE_V2_VERSION = "focus-mode-v2.0";
