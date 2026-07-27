"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listLocalDecisions,
  deleteAllLocalDecisions,
  deleteLocalDecision,
  exportFeedbackBundle,
  importFeedbackBundle,
  decisionsToCsv,
  decisionsFromCsv,
  saveLocalDecision,
  isSyncOptedIn,
  setSyncOptIn,
  buildCatalystAutopsy,
  buildMonthlyFactualSummary,
  listDecisionMonths,
  deriveUserExcursion,
  updateLocalDecision,
  TRADER_FEEDBACK_DISCLAIMER,
  TRADER_FEEDBACK_EVENT,
  TRADER_FEEDBACK_VERSION,
  actionLabel,
  type TraderDecisionRecord,
  type CatalystAutopsy,
  type MonthlyFactualSummary,
} from "@/lib/trader-feedback";
import { Button } from "../ui/button";

export function TraderFeedbackPanel() {
  const [records, setRecords] = useState<TraderDecisionRecord[]>([]);
  const [syncOptIn, setSyncOptInState] = useState(false);
  const [autopsy, setAutopsy] = useState<CatalystAutopsy | null>(null);
  const [month, setMonth] = useState<string>("");
  const [summary, setSummary] = useState<MonthlyFactualSummary | null>(null);
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");

  const refresh = useCallback(() => {
    const list = listLocalDecisions();
    setRecords(list);
    setSyncOptInState(isSyncOptedIn());
    const months = listDecisionMonths(list);
    if (!month && months[0]) setMonth(months[0]);
  }, [month]);

  useEffect(() => {
    refresh();
    const on = () => refresh();
    window.addEventListener(TRADER_FEEDBACK_EVENT, on);
    return () => window.removeEventListener(TRADER_FEEDBACK_EVENT, on);
  }, [refresh]);

  useEffect(() => {
    if (!month) {
      setSummary(null);
      return;
    }
    setSummary(buildMonthlyFactualSummary(records, month));
  }, [records, month]);

  const months = useMemo(() => listDecisionMonths(records), [records]);

  const exportJson = () => {
    const bundle = exportFeedbackBundle(records);
    download(
      JSON.stringify(bundle, null, 2),
      `trustticker-feedback-${new Date().toISOString().slice(0, 10)}.json`,
      "application/json"
    );
  };

  const exportCsv = () => {
    download(
      decisionsToCsv(records),
      `trustticker-feedback-${new Date().toISOString().slice(0, 10)}.csv`,
      "text/csv"
    );
  };

  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(importText);
      const result = importFeedbackBundle(parsed);
      setMessage(
        `Imported ${result.imported} record(s)${
          result.errors.length ? ` · ${result.errors.length} error(s)` : ""
        }`
      );
      setImportText("");
      refresh();
    } catch {
      setMessage("Invalid JSON");
    }
  };

  const handleImportCsv = () => {
    const { records: rows, errors } = decisionsFromCsv(importText);
    for (const r of rows) saveLocalDecision(r);
    setMessage(
      `CSV imported ${rows.length}${errors.length ? ` · ${errors.length} error(s)` : ""}`
    );
    setImportText("");
    refresh();
  };

  const handleDeleteAll = () => {
    if (confirmDelete !== "DELETE") {
      setMessage('Type DELETE to confirm wiping all local feedback records.');
      return;
    }
    const { deleted } = deleteAllLocalDecisions();
    setConfirmDelete("");
    setAutopsy(null);
    setMessage(`Deleted ${deleted} local record(s).`);
    refresh();
  };

  const toggleSync = async (next: boolean) => {
    if (next) {
      const ok = window.confirm(
        "Sync copies your decision records to your TrustTicker account. They stay private to you. Continue?"
      );
      if (!ok) return;
    }
    setSyncOptIn(next);
    setSyncOptInState(next);
    try {
      await fetch("/api/trader-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "opt_in", optIn: next }),
      });
      if (next) {
        for (const r of listLocalDecisions()) {
          await fetch("/api/trader-feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "upsert", record: r }),
          });
        }
        setMessage("Sync enabled. Local records copied to your account.");
      } else {
        setMessage("Sync disabled. Local records unchanged.");
      }
    } catch {
      setMessage("Could not update sync preference.");
    }
  };

  const openAutopsy = (r: TraderDecisionRecord) => {
    const derived = deriveUserExcursion(r);
    if (derived.mfePct != null || derived.maePct != null) {
      updateLocalDecision(r.id, {
        mfePctAfter: derived.mfePct,
        maePctAfter: derived.maePct,
      });
    }
    const fresh = listLocalDecisions().find((x) => x.id === r.id) ?? r;
    setAutopsy(
      buildCatalystAutopsy(fresh, listLocalDecisions(), {
        mfePctAfter: derived.mfePct ?? fresh.mfePctAfter,
        maePctAfter: derived.maePct ?? fresh.maePctAfter,
      })
    );
  };

  return (
    <section
      className="rounded-lg border border-[--border] bg-[--bg-graphite]/40 p-4 space-y-3"
      data-guide="trader-feedback-panel"
    >
      <div>
        <h3 className="text-sm font-semibold text-[--text-primary]">
          Trader feedback &amp; autopsy
        </h3>
        <p className="text-[11px] text-[--text-muted] mt-0.5">
          {TRADER_FEEDBACK_VERSION} · local by default · informational only
        </p>
        <p className="text-[10px] text-[--text-muted] mt-1 leading-relaxed">
          {TRADER_FEEDBACK_DISCLAIMER}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={exportJson}>
          Export JSON
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={exportCsv}>
          Export CSV
        </Button>
        <label className="flex items-center gap-1.5 text-[11px] text-[--text-secondary]">
          <input
            type="checkbox"
            checked={syncOptIn}
            onChange={(e) => void toggleSync(e.target.checked)}
          />
          Opt in to account sync
        </label>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] text-[--text-muted]">
          Import JSON or standardized CSV (no brokerage connection)
        </label>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={3}
          className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] font-mono text-zinc-300"
          placeholder='{"format":"trustticker-trader-feedback",...} or CSV'
        />
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={handleImportJson}>
            Import JSON
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleImportCsv}>
            Import CSV
          </Button>
        </div>
      </div>

      <div className="border-t border-[--border] pt-3 space-y-2">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold">Monthly factual summary</h4>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[11px]"
          >
            {months.length === 0 && <option value="">No months</option>}
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        {summary && (
          <ul className="text-[11px] text-[--text-secondary] space-y-0.5">
            <li>Alerts reviewed (proxy): {summary.alertsReviewed}</li>
            <li>Decisions recorded: {summary.decisionsRecorded}</li>
            <li>
              Average catalyst age:{" "}
              {summary.averageCatalystAgeMin != null
                ? `${summary.averageCatalystAgeMin} min`
                : "—"}
            </li>
            <li>
              Entered while EXTENDED:{" "}
              {summary.pctEnteredWhileExtended != null
                ? `${(summary.pctEnteredWhileExtended * 100).toFixed(0)}%`
                : "—"}
            </li>
            <li>
              Skipped for dilution:{" "}
              {summary.pctSkippedForDilution != null
                ? `${(summary.pctSkippedForDilution * 100).toFixed(0)}%`
                : "—"}
            </li>
            <li>
              Outcomes by catalyst type:{" "}
              {summary.outcomesByCatalystType
                .map(
                  (x) =>
                    `${x.type} [watched ${x.byAction.watched}, entered ${x.byAction.entered}, skipped ${x.byAction.skipped}, ignored ${x.byAction.ignored}]`
                )
                .join("; ") || "—"}
            </li>
            <li>
              Outcomes by reaction stage:{" "}
              {summary.outcomesByReactionStage
                .map(
                  (x) =>
                    `${x.stage} [watched ${x.byAction.watched}, entered ${x.byAction.entered}, skipped ${x.byAction.skipped}, ignored ${x.byAction.ignored}]`
                )
                .join("; ") || "—"}
            </li>
            {summary.userRecordedNotionalPnl && (
              <li className="text-amber-200/90">
                {summary.userRecordedNotionalPnl.label}:{" "}
                {summary.userRecordedNotionalPnl.totalPnl} (n=
                {summary.userRecordedNotionalPnl.sampleSize})
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="border-t border-[--border] pt-3 space-y-2">
        <h4 className="text-xs font-semibold">
          Decisions ({records.length})
        </h4>
        <ul className="max-h-48 overflow-auto space-y-1 text-[11px]">
          {records.length === 0 && (
            <li className="text-[--text-muted]">No records yet.</li>
          )}
          {records.slice(0, 40).map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-2 border-b border-[--border]/40 py-1"
            >
              <span className="font-mono">{r.symbol}</span>
              <span>{actionLabel(r.action)}</span>
              <span className="text-[--text-muted]">
                {new Date(r.decidedAt).toLocaleString()}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 text-[10px]"
                onClick={() => openAutopsy(r)}
              >
                Autopsy
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] text-red-400"
                onClick={() => {
                  deleteLocalDecision(r.id);
                  refresh();
                }}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </div>

      {autopsy && (
        <div className="rounded border border-zinc-700 bg-zinc-950/50 p-3 space-y-1 text-[11px]">
          <h4 className="font-semibold text-[--text-primary]">
            Autopsy · {autopsy.symbol} · {actionLabel(autopsy.action)}
          </h4>
          <ul className="text-[--text-secondary] space-y-0.5">
            <li>
              Catalyst age at decision:{" "}
              {autopsy.catalystAgeMin != null
                ? `${autopsy.catalystAgeMin.toFixed(1)} min`
                : "unavailable"}
            </li>
            <li>
              Reaction stage: {autopsy.reactionStageAtDecision ?? "unavailable"}
            </li>
            <li>
              Tradeability: {autopsy.tradeabilityAtDecision ?? "unavailable"}
            </li>
            <li>
              Risks visible:{" "}
              {autopsy.risksVisibleAtDecision.join(", ") || "none recorded"}
            </li>
            <li>
              Move before entry:{" "}
              {autopsy.moveCompletedBeforeEntryPct != null
                ? `${autopsy.moveCompletedBeforeEntryPct.toFixed(1)}%`
                : "unavailable"}
            </li>
            <li>
              MFE / MAE after: {fmt(autopsy.mfePctAfter)} /{" "}
              {fmt(autopsy.maePctAfter)}
            </li>
            <li>
              Followed own alert rules:{" "}
              {autopsy.followedOwnAlertRules == null
                ? "unknown"
                : autopsy.followedOwnAlertRules
                  ? "yes"
                  : "no"}
            </li>
            <li>
              Similar past decisions:{" "}
              {autopsy.similarPastDecisions.length
                ? autopsy.similarPastDecisions
                    .map((s) => `${s.symbol} ${s.action}`)
                    .join(", ")
                : "none"}
            </li>
            <li>
              Missing information:{" "}
              {autopsy.missingInformation.join(", ") || "none flagged"}
            </li>
          </ul>
          <p className="text-[10px] text-[--text-muted]">{autopsy.disclaimer}</p>
        </div>
      )}

      <div className="border-t border-red-900/40 pt-3 space-y-2">
        <h4 className="text-xs font-semibold text-red-300/90">Privacy</h4>
        <p className="text-[10px] text-[--text-muted]">
          Delete all local records. Cloud copies require a separate delete when
          sync was used.
        </p>
        <input
          value={confirmDelete}
          onChange={(e) => setConfirmDelete(e.target.value)}
          placeholder='Type DELETE'
          className="w-40 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px]"
        />
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={handleDeleteAll}
        >
          Delete all local records
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            await fetch("/api/trader-feedback?all=1", { method: "DELETE" });
            setMessage("Requested deletion of cloud copies (if any).");
          }}
        >
          Delete cloud copies
        </Button>
      </div>

      {message && (
        <p className="text-[11px] text-sky-300/90" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

function fmt(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
