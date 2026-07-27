import {
  TRADER_FEEDBACK_EVENT,
  TRADER_FEEDBACK_STORAGE_KEY,
  TRADER_FEEDBACK_SYNC_KEY,
  TRADER_FEEDBACK_DISCLAIMER,
} from "./version.ts";
import { parseDecisionRecord } from "./record.ts";
import type { TraderDecisionRecord, TraderFeedbackBundle } from "./types.ts";
import { TRADER_FEEDBACK_VERSION } from "./version.ts";

const MAX_RECORDS = 500;

function emit(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TRADER_FEEDBACK_EVENT));
}

export function listLocalDecisions(): TraderDecisionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TRADER_FEEDBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseDecisionRecord)
      .filter((x): x is TraderDecisionRecord => Boolean(x))
      .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
  } catch {
    return [];
  }
}

function writeAll(records: TraderDecisionRecord[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    TRADER_FEEDBACK_STORAGE_KEY,
    JSON.stringify(records.slice(0, MAX_RECORDS))
  );
  emit();
}

export function saveLocalDecision(
  record: TraderDecisionRecord
): TraderDecisionRecord {
  const all = listLocalDecisions().filter((r) => r.id !== record.id);
  writeAll([record, ...all]);
  return record;
}

export function updateLocalDecision(
  id: string,
  patch: Partial<TraderDecisionRecord>
): TraderDecisionRecord | null {
  const all = listLocalDecisions();
  const idx = all.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const next = {
    ...all[idx]!,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  all[idx] = next;
  writeAll(all);
  return next;
}

export function deleteLocalDecision(id: string): boolean {
  const all = listLocalDecisions();
  const next = all.filter((r) => r.id !== id);
  if (next.length === all.length) return false;
  writeAll(next);
  return true;
}

/** Delete every local trader-feedback record. */
export function deleteAllLocalDecisions(): { deleted: number } {
  const n = listLocalDecisions().length;
  if (typeof window !== "undefined") {
    localStorage.removeItem(TRADER_FEEDBACK_STORAGE_KEY);
    emit();
  }
  return { deleted: n };
}

export function isSyncOptedIn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(TRADER_FEEDBACK_SYNC_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Explicit opt-in required before any sync.
 * Default is false — local only.
 */
export function setSyncOptIn(optIn: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TRADER_FEEDBACK_SYNC_KEY, optIn ? "1" : "0");
  emit();
}

export function exportFeedbackBundle(
  records?: TraderDecisionRecord[]
): TraderFeedbackBundle {
  return {
    format: "trustticker-trader-feedback",
    schemaVersion: TRADER_FEEDBACK_VERSION,
    exportedAt: new Date().toISOString(),
    records: records ?? listLocalDecisions(),
    disclaimer: TRADER_FEEDBACK_DISCLAIMER,
  };
}

export function importFeedbackBundle(raw: unknown): {
  ok: boolean;
  imported: number;
  errors: string[];
} {
  const errors: string[] = [];
  let list: unknown[] = [];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (o.format === "trustticker-trader-feedback" && Array.isArray(o.records)) {
      list = o.records;
    } else {
      return { ok: false, imported: 0, errors: ["Unrecognized bundle format"] };
    }
  } else if (Array.isArray(raw)) {
    list = raw;
  } else {
    return { ok: false, imported: 0, errors: ["Invalid JSON"] };
  }

  const existing = listLocalDecisions();
  const byId = new Map(existing.map((r) => [r.id, r]));
  let imported = 0;
  for (let i = 0; i < list.length; i++) {
    const parsed = parseDecisionRecord(list[i]);
    if (!parsed) {
      errors.push(`Row ${i}: invalid record`);
      continue;
    }
    parsed.syncState = "local";
    byId.set(parsed.id, parsed);
    imported++;
  }
  writeAll([...byId.values()]);
  return { ok: imported > 0, imported, errors };
}

/** Test helper — inject records without browser */
export function __setRecordsForTests(records: TraderDecisionRecord[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(TRADER_FEEDBACK_STORAGE_KEY, JSON.stringify(records));
}
