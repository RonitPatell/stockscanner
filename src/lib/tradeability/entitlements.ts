/**
 * Market-data entitlements for tradeability.
 * Depth-based estimates require licensed L1 — never invent depth.
 */
export function hasLicensedL1Depth(opts?: {
  override?: boolean;
  /** Explicit tape fields present from a licensed stream */
  tapeHasBidAskSize?: boolean;
}): boolean {
  if (opts?.override != null) return opts.override;
  const env = process.env.MARKET_DATA_L1_LICENSED;
  if (env != null && env !== "") {
    return !/^(0|false|off|no)$/i.test(env);
  }
  // Presence of sizes alone is not a license grant — require explicit env
  // unless caller overrides in tests with hasLicensedDepth.
  void opts?.tapeHasBidAskSize;
  return false;
}

export function depthUnavailableNote(hasLicense: boolean): string {
  return hasLicense
    ? "depth_sizes_missing"
    : "requires_licensed_l1_depth";
}
