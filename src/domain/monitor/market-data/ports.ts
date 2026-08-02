import type {
  BackfillRequest,
  MarketDataProviderId,
  NormalizedMarketEvent,
  ProviderCapabilities,
  SubscribeRequest,
} from "./types.ts";

export type MarketDataListener = (event: NormalizedMarketEvent) => void;

/**
 * Vendor-neutral market-data provider port.
 * Adapters implement this; domain never imports vendor SDKs.
 *
 * Credentials must live only in adapter construction (server process).
 * Never serialize secrets onto events or client payloads.
 */
export interface MarketDataProvider {
  readonly id: MarketDataProviderId;
  readonly capabilities: ProviderCapabilities;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /**
   * Subscribe after entitlement check (caller must call assertSubscribeAllowed).
   */
  subscribe(req: SubscribeRequest): Promise<void>;
  unsubscribe(symbols: string[]): Promise<void>;

  onEvent(listener: MarketDataListener): () => void;

  /**
   * Optional gap backfill when the vendor API supports it.
   * Returns normalized events (unordered OK — pipeline will sequence).
   */
  backfillGaps?(req: BackfillRequest): Promise<NormalizedMarketEvent[]>;
}

/** Server-only credential bag — never log or return to clients. */
export interface ProviderCredentialRef {
  /** Opaque handle / env key name — not the secret value */
  envKey: string;
  present: boolean;
}

export function credentialRefFromEnv(envKey: string): ProviderCredentialRef {
  return {
    envKey,
    present: Boolean(
      typeof process !== "undefined" &&
        process.env &&
        process.env[envKey] &&
        String(process.env[envKey]).length > 0
    ),
  };
}

/** Strip any accidental secret-like keys from objects before client send. */
const SECRET_KEY =
  /^(api[_-]?key|token|secret|password|authorization|credential)/i;

export function redactProviderSecrets<T extends Record<string, unknown>>(
  obj: T
): T {
  const out: Record<string, unknown> = { ...obj };
  for (const key of Object.keys(out)) {
    if (SECRET_KEY.test(key)) {
      out[key] = "[redacted]";
    }
  }
  return out as T;
}
