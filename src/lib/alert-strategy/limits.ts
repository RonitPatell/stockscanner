/** Hard limits for Alert Strategy / Monitor presets — nesting, rules, payload. */

export const STRATEGY_LIMITS = {
  /** Max nested group depth (root = 0). */
  maxNestingDepth: 2,
  /** Max total conditions across the tree. */
  maxConditions: 40,
  /** Max nested groups (excluding root). */
  maxGroups: 16,
  /** Max strategies in one import bundle. */
  maxImportStrategies: 20,
  /** Max JSON payload bytes for export/import body. */
  maxPayloadBytes: 48_000,
  /** Max characters for a single userNote. */
  maxUserNoteChars: 500,
} as const;
