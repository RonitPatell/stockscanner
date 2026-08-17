/**
 * Filing section redlines (10-Q / 10-K) — textual diffs, no LLM.
 */

export const FILINGS_ENGINE_VERSION = "1.0.0";

export const FILING_SECTION_KEYS = [
  "risk_factors",
  "mda",
  "liquidity",
] as const;

export type FilingSectionKey = (typeof FILING_SECTION_KEYS)[number];

export type FilingDiffStatus =
  | "unchanged"
  | "changed"
  | "formatting_only"
  | "missing_current"
  | "missing_prior"
  | "new_section";

export type DiffParagraphChange = {
  before: string;
  after: string;
};

export type SectionDiffResult = {
  status: FilingDiffStatus;
  sectionKey: FilingSectionKey;
  sectionTitle: string;
  added: string[];
  removed: string[];
  changed: DiffParagraphChange[];
  stats: {
    addedChars: number;
    removedChars: number;
    changedChars: number;
    changeRatio: number;
    priorLength: number;
    currentLength: number;
  };
  /** Size threshold for CompanyEvent — not a claim about specific financial risk */
  material: boolean;
};

export type ExtractedSection = {
  sectionKey: FilingSectionKey;
  sectionTitle: string;
  text: string;
  found: boolean;
};

/** Char / ratio gates for material section change events */
export const MATERIAL_ADDED_REMOVED_CHARS = 800;
export const MATERIAL_CHANGE_RATIO = 0.04;
export const MATERIAL_PARAGRAPH_COUNT = 2;
