/**
 * SEC form → base CompanyEventType mapping (deterministic).
 */

import type { CompanyEventCategory, CompanyEventType } from "./types.ts";

/** Canonical form labels used in classification. */
export const SUPPORTED_SEC_FORMS = [
  "8-K",
  "10-Q",
  "10-K",
  "NT 10-Q",
  "NT 10-K",
  "S-1",
  "S-1/A",
  "S-3",
  "S-3/A",
  "424B5",
  "EFFECT",
  "DEF 14A",
  "3",
  "4",
  "5",
  "144",
  "SC 13D",
  "SC 13D/A",
  "SC 13G",
  "SC 13G/A",
  "13F-HR",
] as const;

export type SupportedSecForm = (typeof SUPPORTED_SEC_FORMS)[number];

export type FormBaseMapping = {
  form: SupportedSecForm;
  eventType: CompanyEventType;
  category: CompanyEventCategory;
  /** Default severity when no finer item is classified. */
  severity: "info" | "notable" | "material" | "critical" | "unknown";
};

export const FORM_BASE_MAP: FormBaseMapping[] = [
  { form: "8-K", eventType: "sec_8k", category: "filing", severity: "notable" },
  { form: "10-Q", eventType: "sec_10q", category: "filing", severity: "notable" },
  { form: "10-K", eventType: "sec_10k", category: "filing", severity: "notable" },
  { form: "NT 10-Q", eventType: "sec_nt_10q", category: "filing", severity: "material" },
  { form: "NT 10-K", eventType: "sec_nt_10k", category: "filing", severity: "material" },
  { form: "S-1", eventType: "sec_s1", category: "capital", severity: "notable" },
  { form: "S-1/A", eventType: "sec_s1_a", category: "capital", severity: "notable" },
  { form: "S-3", eventType: "sec_s3", category: "capital", severity: "notable" },
  { form: "S-3/A", eventType: "sec_s3_a", category: "capital", severity: "notable" },
  { form: "424B5", eventType: "sec_424b5", category: "capital", severity: "notable" },
  { form: "EFFECT", eventType: "sec_effect", category: "capital", severity: "notable" },
  { form: "DEF 14A", eventType: "sec_def_14a", category: "governance", severity: "info" },
  { form: "3", eventType: "sec_form3", category: "insider", severity: "info" },
  { form: "4", eventType: "sec_form4", category: "insider", severity: "notable" },
  { form: "5", eventType: "sec_form5", category: "insider", severity: "info" },
  { form: "144", eventType: "sec_form144", category: "insider", severity: "info" },
  { form: "SC 13D", eventType: "sec_13d", category: "ownership", severity: "material" },
  { form: "SC 13D/A", eventType: "sec_13d_a", category: "ownership", severity: "notable" },
  { form: "SC 13G", eventType: "sec_13g", category: "ownership", severity: "notable" },
  { form: "SC 13G/A", eventType: "sec_13g_a", category: "ownership", severity: "info" },
  { form: "13F-HR", eventType: "sec_13f", category: "ownership", severity: "info" },
];

const FORM_BY_NORM = new Map<string, FormBaseMapping>();
for (const m of FORM_BASE_MAP) {
  FORM_BY_NORM.set(normalizeSecFormKey(m.form), m);
}

export function normalizeSecFormKey(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/^FORM\s+/, "")
    .replace(/^SCHEDULE\s+/, "SC ");
}

/**
 * Parse form type from rawNewsId, explicit formType, or headline.
 * Returns canonical SupportedSecForm or null.
 */
export function resolveSecForm(opts: {
  formType?: string | null;
  rawNewsId?: string | null;
  title?: string | null;
}): SupportedSecForm | null {
  if (opts.formType) {
    const hit = FORM_BY_NORM.get(normalizeSecFormKey(opts.formType));
    if (hit) return hit.form;
  }

  if (opts.rawNewsId) {
    const m = opts.rawNewsId.match(
      /^sec-(nt-10-q|nt-10-k|10-q|10-k|424b5|s-1\/a|s-3\/a|s-1|s-3|8-k|def-14a|effect|sc-13d\/a|sc-13g\/a|sc-13d|sc-13g|13f-hr|form3|form5|form144|3|4|5|144)(?:-|$)/i
    );
    if (m) {
      const slug = m[1].toLowerCase();
      const mapped = slugToForm(slug);
      if (mapped) return mapped;
    }
  }

  if (opts.title) {
    const t = opts.title.toUpperCase();
    const patterns: [RegExp, SupportedSecForm][] = [
      [/\bNT\s*10-Q\b/, "NT 10-Q"],
      [/\bNT\s*10-K\b/, "NT 10-K"],
      [/\b10-Q\b/, "10-Q"],
      [/\b10-K\b/, "10-K"],
      [/\b424\s*B\s*5\b|\b424B5\b/, "424B5"],
      [/\bS-1\/A\b/, "S-1/A"],
      [/\bS-3\/A\b/, "S-3/A"],
      [/\bS-1\b/, "S-1"],
      [/\bS-3\b/, "S-3"],
      [/\b8-K\b/, "8-K"],
      [/\bDEF\s*14A\b/, "DEF 14A"],
      [/\bEFFECT\b/, "EFFECT"],
      [/\bSC\s*13D\/A\b|\b13D\/A\b/, "SC 13D/A"],
      [/\bSC\s*13G\/A\b|\b13G\/A\b/, "SC 13G/A"],
      [/\bSC\s*13D\b|\bSCHEDULE\s*13D\b/, "SC 13D"],
      [/\bSC\s*13G\b|\bSCHEDULE\s*13G\b/, "SC 13G"],
      [/\b13F-HR\b|\b13F\b/, "13F-HR"],
      [/\bFORM\s*144\b|\b144\b/, "144"],
      [/\bFORM\s*3\b/, "3"],
      [/\bFORM\s*5\b/, "5"],
      [/\bFORM\s*4\b/, "4"],
    ];
    for (const [re, form] of patterns) {
      if (re.test(t)) return form;
    }
  }

  return null;
}

function slugToForm(slug: string): SupportedSecForm | null {
  const map: Record<string, SupportedSecForm> = {
    "8-k": "8-K",
    "10-q": "10-Q",
    "10-k": "10-K",
    "nt-10-q": "NT 10-Q",
    "nt-10-k": "NT 10-K",
    "s-1": "S-1",
    "s-1/a": "S-1/A",
    "s-3": "S-3",
    "s-3/a": "S-3/A",
    "424b5": "424B5",
    effect: "EFFECT",
    "def-14a": "DEF 14A",
    "3": "3",
    form3: "3",
    "4": "4",
    "5": "5",
    form5: "5",
    "144": "144",
    form144: "144",
    "sc-13d": "SC 13D",
    "sc-13d/a": "SC 13D/A",
    "sc-13g": "SC 13G",
    "sc-13g/a": "SC 13G/A",
    "13f-hr": "13F-HR",
  };
  return map[slug] ?? null;
}

export function formBaseMapping(
  form: SupportedSecForm
): FormBaseMapping {
  return FORM_BY_NORM.get(normalizeSecFormKey(form))!;
}

/** id-safe slug for rawNewsId (matches sec-edgar formIdSlug style). */
export function secFormIdSlug(form: string): string {
  return form.toLowerCase().replace(/\s+/g, "-");
}
