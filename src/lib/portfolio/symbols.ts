/** Pure portfolio symbol helpers (no Prisma — safe for node:test). */

export function normalizePortfolioSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (!/^[A-Z]{1,5}$/.test(s)) return null;
  return s;
}
