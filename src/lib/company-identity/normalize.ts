import { isValidTickerFormat } from "../ticker-utils.ts";

/** Trim, uppercase, drop non-letters. Empty if not a 1–5 letter US ticker. */
export function normalizeSymbol(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 5);
}

export function isUsTickerSymbol(symbol: string): boolean {
  return isValidTickerFormat(symbol);
}

/** Digits only, left-padded to 10. Empty string if no digits. Never invents a CIK. */
export function normalizeCik(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length > 10) return digits.slice(-10);
  return digits.padStart(10, "0");
}

export function cikUnpadded(cik: string): string {
  return cik.replace(/^0+/, "") || "0";
}
