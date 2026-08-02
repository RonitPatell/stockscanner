/**
 * Server-only credential resolution for market-data adapters.
 *
 * NEVER import this module from client components or route response builders
 * that echo env values. Prefer passing booleans / ProviderCredentialRef.
 */

import { credentialRefFromEnv } from "../../../domain/monitor/market-data/ports.ts";

export function finnhubCredentialRef() {
  return credentialRefFromEnv("FINNHUB_API_KEY");
}

export function polygonCredentialRef() {
  return credentialRefFromEnv("POLYGON_API_KEY");
}

/** Read secret only inside server adapters — do not export the value upward. */
export function readServerSecret(envKey: string): string | null {
  if (typeof process === "undefined" || !process.env) return null;
  const v = process.env[envKey];
  return v && v.length > 0 ? v : null;
}
