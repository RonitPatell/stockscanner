import type { SourceDefinition } from "./types.ts";

/** Feature flag: INGEST_SOURCE_<ID>_ENABLED=false disables a source. */
export function isSourceFlagEnabled(def: SourceDefinition): boolean {
  const raw = process.env[def.featureFlag];
  if (raw != null && raw.trim() !== "") {
    const v = raw.trim().toLowerCase();
    if (v === "0" || v === "false" || v === "off" || v === "disabled") return false;
  }
  if (def.requiresEnv) {
    const key = process.env[def.requiresEnv]?.trim();
    if (!key) return false;
  }
  // Global kill-switch for a whole tier: INGEST_TIER_0_ENABLED=false
  const tierFlag = process.env[`INGEST_TIER_${def.tier}_ENABLED`];
  if (tierFlag != null && tierFlag.trim() !== "") {
    const v = tierFlag.trim().toLowerCase();
    if (v === "0" || v === "false" || v === "off" || v === "disabled") return false;
  }
  return true;
}

/** Master switch for the priority ingest system (default on). */
export function isPriorityIngestEnabled(): boolean {
  const raw = process.env.PRIORITY_INGEST_ENABLED;
  if (raw == null || raw.trim() === "") return true;
  const v = raw.trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "off");
}
