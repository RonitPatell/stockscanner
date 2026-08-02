/**
 * Provider connection inventory for Monitor Ops.
 * Exposes configured:boolean only — never API keys or tokens.
 */

import type { MonitorOpsControls, ProviderConnectionRow } from "@/domain/monitor/ops";
import { isProviderDisabled } from "@/domain/monitor/ops";

type ProviderDef = {
  id: string;
  label: string;
  envKeys: string[];
};

const PROVIDERS: ProviderDef[] = [
  { id: "finnhub", label: "Finnhub", envKeys: ["FINNHUB_API_KEY"] },
  {
    id: "polygon",
    label: "Polygon",
    envKeys: ["POLYGON_API_KEY", "MASSIVE_API_KEY"],
  },
  { id: "yahoo", label: "Yahoo (public)", envKeys: [] },
  { id: "fake", label: "Fake / fixture", envKeys: [] },
  {
    id: "official_halt",
    label: "Official halt feed",
    envKeys: ["OFFICIAL_HALT_FEED_URL"],
  },
  {
    id: "licensed_sip",
    label: "Licensed SIP",
    envKeys: ["LICENSED_SIP_ENDPOINT"],
  },
];

function envConfigured(keys: string[]): boolean {
  if (keys.length === 0) return true; // public / local adapters
  return keys.some((k) => Boolean(process.env[k]?.trim()));
}

export function listProviderConnections(
  controls: MonitorOpsControls
): ProviderConnectionRow[] {
  return PROVIDERS.map((p) => {
    const configured = envConfigured(p.envKeys);
    const disabled = isProviderDisabled(controls, p.id);
    let state: ProviderConnectionRow["state"] = "unknown";
    if (disabled) state = "disabled";
    else if (!configured && p.envKeys.length > 0) state = "disconnected";
    else if (configured) state = "connected";
    return {
      id: p.id,
      label: p.label,
      configured,
      enabled: !disabled,
      state,
      lastError: null,
      subscribedSymbolCount: null,
    };
  });
}
