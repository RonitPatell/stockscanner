/** Dashboard Shell V3 — progressive disclosure IA. */

export function isDashboardShellV3Enabled(): boolean {
  const raw =
    process.env.NEXT_PUBLIC_DASHBOARD_SHELL_V3 ??
    process.env.DASHBOARD_SHELL_V3 ??
    "";
  const v = raw.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  // Visible in local/dev by default; production requires explicit opt-in.
  return process.env.NODE_ENV === "development";
}

export const DASHBOARD_SHELL_V3_FLAG = "dashboardShellV3";
