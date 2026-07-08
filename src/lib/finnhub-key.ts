/** Finnhub key sometimes arrives with surrounding quotes from .env loaders */
export function resolveFinnhubKey(): string | null {
  const raw = process.env.FINNHUB_API_KEY;
  if (!raw) return null;
  const key = raw.trim().replace(/^["']|["']$/g, "");
  return key.length > 0 ? key : null;
}
