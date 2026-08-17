/**
 * Paragraph-level textual diff — Added / Removed / Changed.
 * Formatting-only differences (whitespace/table pipes) → formatting_only.
 */

import {
  normalizeForFormatCompare,
  paragraphKey,
  splitParagraphs,
} from "./normalize.ts";
import {
  MATERIAL_ADDED_REMOVED_CHARS,
  MATERIAL_CHANGE_RATIO,
  MATERIAL_PARAGRAPH_COUNT,
  type FilingSectionKey,
  type SectionDiffResult,
} from "./types.ts";
import { sectionTitleFor } from "./extract.ts";
import { createHash } from "node:crypto";

export function hashSectionText(text: string): string {
  const norm = normalizeForFormatCompare(text);
  return createHash("sha256").update(norm).digest("hex").slice(0, 40);
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const na = normalizeForFormatCompare(a);
  const nb = normalizeForFormatCompare(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  // Dice on word bigrams — cheap near-duplicate signal
  const wa = new Set(na.split(" ").filter(Boolean));
  const wb = new Set(nb.split(" ").filter(Boolean));
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return (2 * inter) / (wa.size + wb.size || 1);
}

/**
 * Diff prior vs current section text.
 */
export function diffSections(opts: {
  sectionKey: FilingSectionKey;
  priorText: string | null;
  currentText: string | null;
}): SectionDiffResult {
  const title = sectionTitleFor(opts.sectionKey);
  const prior = opts.priorText?.trim() || "";
  const current = opts.currentText?.trim() || "";

  if (!current && !prior) {
    return emptyResult(opts.sectionKey, title, "missing_current");
  }
  if (!current && prior) {
    return emptyResult(opts.sectionKey, title, "missing_current");
  }
  if (current && !prior) {
    const paras = splitParagraphs(current).slice(0, 40);
    const addedChars = current.length;
    return {
      status: "new_section",
      sectionKey: opts.sectionKey,
      sectionTitle: title,
      added: paras,
      removed: [],
      changed: [],
      stats: {
        addedChars,
        removedChars: 0,
        changedChars: 0,
        changeRatio: 1,
        priorLength: 0,
        currentLength: current.length,
      },
      material: isMaterial({
        addedChars,
        removedChars: 0,
        changeRatio: 1,
        paraCount: paras.length,
      }),
    };
  }

  // Formatting-only: same content after aggressive normalize
  if (normalizeForFormatCompare(prior) === normalizeForFormatCompare(current)) {
    return {
      status: "formatting_only",
      sectionKey: opts.sectionKey,
      sectionTitle: title,
      added: [],
      removed: [],
      changed: [],
      stats: {
        addedChars: 0,
        removedChars: 0,
        changedChars: 0,
        changeRatio: 0,
        priorLength: prior.length,
        currentLength: current.length,
      },
      material: false,
    };
  }

  if (hashSectionText(prior) === hashSectionText(current)) {
    return {
      status: "unchanged",
      sectionKey: opts.sectionKey,
      sectionTitle: title,
      added: [],
      removed: [],
      changed: [],
      stats: {
        addedChars: 0,
        removedChars: 0,
        changedChars: 0,
        changeRatio: 0,
        priorLength: prior.length,
        currentLength: current.length,
      },
      material: false,
    };
  }

  const priorParas = splitParagraphs(prior);
  const currParas = splitParagraphs(current);
  const priorUsed = new Set<number>();
  const currUsed = new Set<number>();

  const changed: { before: string; after: string }[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  // Exact key matches
  const priorByKey = new Map<string, number[]>();
  priorParas.forEach((p, i) => {
    const k = paragraphKey(p);
    const arr = priorByKey.get(k) ?? [];
    arr.push(i);
    priorByKey.set(k, arr);
  });

  currParas.forEach((p, i) => {
    const k = paragraphKey(p);
    const idxs = priorByKey.get(k);
    if (idxs && idxs.length) {
      const pi = idxs.shift()!;
      priorUsed.add(pi);
      currUsed.add(i);
    }
  });

  // Near-duplicate → Changed
  for (let i = 0; i < currParas.length; i++) {
    if (currUsed.has(i)) continue;
    let bestJ = -1;
    let bestSim = 0;
    for (let j = 0; j < priorParas.length; j++) {
      if (priorUsed.has(j)) continue;
      const sim = similarity(currParas[i]!, priorParas[j]!);
      if (sim > bestSim) {
        bestSim = sim;
        bestJ = j;
      }
    }
    if (bestJ >= 0 && bestSim >= 0.55 && bestSim < 0.98) {
      changed.push({ before: priorParas[bestJ]!, after: currParas[i]! });
      priorUsed.add(bestJ);
      currUsed.add(i);
    }
  }

  for (let i = 0; i < currParas.length; i++) {
    if (!currUsed.has(i)) added.push(currParas[i]!);
  }
  for (let j = 0; j < priorParas.length; j++) {
    if (!priorUsed.has(j)) removed.push(priorParas[j]!);
  }

  const addedChars = added.reduce((n, p) => n + p.length, 0);
  const removedChars = removed.reduce((n, p) => n + p.length, 0);
  const changedChars = changed.reduce(
    (n, c) => n + Math.abs(c.after.length - c.before.length) + 20,
    0
  );
  const denom = Math.max(prior.length, current.length, 1);
  const changeRatio =
    (addedChars + removedChars + changedChars) / denom;

  const material = isMaterial({
    addedChars: addedChars + removedChars,
    removedChars,
    changeRatio,
    paraCount: added.length + removed.length + changed.length,
  });

  const unchanged =
    added.length === 0 && removed.length === 0 && changed.length === 0;

  return {
    status: unchanged ? "unchanged" : "changed",
    sectionKey: opts.sectionKey,
    sectionTitle: title,
    added: added.slice(0, 30),
    removed: removed.slice(0, 30),
    changed: changed.slice(0, 20),
    stats: {
      addedChars,
      removedChars,
      changedChars,
      changeRatio,
      priorLength: prior.length,
      currentLength: current.length,
    },
    material,
  };
}

function isMaterial(opts: {
  addedChars: number;
  removedChars: number;
  changeRatio: number;
  paraCount: number;
}): boolean {
  if (opts.paraCount >= MATERIAL_PARAGRAPH_COUNT) return true;
  if (opts.addedChars >= MATERIAL_ADDED_REMOVED_CHARS) return true;
  if (opts.changeRatio >= MATERIAL_CHANGE_RATIO) return true;
  return false;
}

function emptyResult(
  sectionKey: FilingSectionKey,
  title: string,
  status: SectionDiffResult["status"]
): SectionDiffResult {
  return {
    status,
    sectionKey,
    sectionTitle: title,
    added: [],
    removed: [],
    changed: [],
    stats: {
      addedChars: 0,
      removedChars: 0,
      changedChars: 0,
      changeRatio: 0,
      priorLength: 0,
      currentLength: 0,
    },
    material: false,
  };
}
