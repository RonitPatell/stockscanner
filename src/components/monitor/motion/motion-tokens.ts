/**
 * TrustTicker Monitor — motion token constants (mirror CSS).
 * Responsive desk motion, not game juice. No overshoot bounce.
 */

/** Instant feedback — 80–120ms */
export const MON_DURATION_INSTANT_MS = 100;
/** Hover / control — 120–180ms */
export const MON_DURATION_CONTROL_MS = 150;
/** Drawer / panel — 200–280ms */
export const MON_DURATION_PANEL_MS = 240;
/** Rank / spatial layout — 300–500ms */
export const MON_DURATION_LAYOUT_MS = 400;
/** Critical-state appearance — no decorative delay */
export const MON_DURATION_CRITICAL_MS = 0;

/** Tooltip show delay (ms) */
export const MON_TOOLTIP_DELAY_MS = 280;
/** Value-change highlight lifetime */
export const MON_VALUE_FLASH_MS = 480;
/** Coalesce window for rapid quote ticks */
export const MON_VALUE_COALESCE_MS = 120;
/** Recovered connection confirmation hold */
export const MON_RECOVERED_HOLD_MS = 1600;
/** New Event Tape item enter emphasis */
export const MON_TAPE_ENTER_MS = 360;
/** Squawk speaking indicator hold after speech ends (visual settle) */
export const MON_SQUAWK_SPEAK_SETTLE_MS = 200;

/** Absolute price noise floor (display units) — skip flash below this */
export const MON_VALUE_MIN_ABS = 0.00005;
/** Relative move floor for larger magnitudes */
export const MON_VALUE_MIN_REL = 0.0004;

export const MON_MOTION = {
  durationInstantMs: MON_DURATION_INSTANT_MS,
  durationControlMs: MON_DURATION_CONTROL_MS,
  durationPanelMs: MON_DURATION_PANEL_MS,
  durationLayoutMs: MON_DURATION_LAYOUT_MS,
  durationCriticalMs: MON_DURATION_CRITICAL_MS,
  tooltipDelayMs: MON_TOOLTIP_DELAY_MS,
  valueFlashMs: MON_VALUE_FLASH_MS,
  valueCoalesceMs: MON_VALUE_COALESCE_MS,
  recoveredHoldMs: MON_RECOVERED_HOLD_MS,
  tapeEnterMs: MON_TAPE_ENTER_MS,
} as const;
