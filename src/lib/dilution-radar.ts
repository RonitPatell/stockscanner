/**
 * Dilution Radar — re-exports V2 implementation.
 * Legacy callers keep importing from `@/lib/dilution-radar`.
 */
export {
  getDilutionRadar,
  getDilutionTimeline,
  type DilutionAlertV2 as DilutionAlert,
} from "./dilution/radar.ts";
