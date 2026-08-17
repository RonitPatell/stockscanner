"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ThesisDto } from "@/lib/thesis/service";
import { formatHealthSummaryLine } from "@/lib/thesis/labels";
import {
  ThesisConditionBuilder,
  type ConditionBuilderResult,
} from "./ThesisConditionBuilder";
import { ThesisConditionCard } from "./ThesisConditionCard";

type LoadState =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "error"; message: string }
  | { status: "ready"; thesis: ThesisDto | null };

async function parseError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export function ThesisPanel({ symbol }: { symbol: string }) {
  const sym = symbol.toUpperCase();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingConditionId, setEditingConditionId] = useState<string | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const applyThesis = useCallback((thesis: ThesisDto | null) => {
    setLoad({ status: "ready", thesis });
    setNoteDraft(thesis?.note ?? "");
  }, []);

  const refresh = useCallback(async () => {
    setBanner(null);
    const res = await fetch(`/api/thesis?symbol=${encodeURIComponent(sym)}`, {
      credentials: "include",
    });
    if (res.status === 401 || res.status === 403) {
      setLoad({ status: "unauthorized" });
      return;
    }
    if (!res.ok) {
      setLoad({ status: "error", message: await parseError(res) });
      return;
    }
    const data = (await res.json()) as { theses: ThesisDto[] };
    applyThesis(data.theses?.[0] ?? null);
  }, [sym, applyThesis]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createThesis() {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch("/api/thesis", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: sym,
          note: noteDraft.trim() || null,
          status: "active",
        }),
      });
      if (res.status === 401 || res.status === 403) {
        setLoad({ status: "unauthorized" });
        return;
      }
      if (!res.ok) {
        setBanner(await parseError(res));
        return;
      }
      const data = (await res.json()) as { thesis: ThesisDto };
      applyThesis(data.thesis);
      setEditingNote(false);
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    if (load.status !== "ready" || !load.thesis) return;
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/thesis/${load.thesis.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteDraft.trim() || null }),
      });
      if (!res.ok) {
        setBanner(await parseError(res));
        return;
      }
      const data = (await res.json()) as { thesis: ThesisDto };
      applyThesis(data.thesis);
      setEditingNote(false);
    } finally {
      setBusy(false);
    }
  }

  async function addCondition(result: ConditionBuilderResult) {
    if (load.status !== "ready" || !load.thesis) return;
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/thesis/${load.thesis.id}/conditions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!res.ok) {
        setBanner(await parseError(res));
        return;
      }
      const data = (await res.json()) as { thesis: ThesisDto };
      applyThesis(data.thesis);
      setShowBuilder(false);
    } finally {
      setBusy(false);
    }
  }

  async function updateCondition(
    conditionId: string,
    result: ConditionBuilderResult
  ) {
    if (load.status !== "ready" || !load.thesis) return;
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch(
        `/api/thesis/${load.thesis.id}/conditions/${conditionId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(result),
        }
      );
      if (!res.ok) {
        setBanner(await parseError(res));
        return;
      }
      const data = (await res.json()) as { thesis: ThesisDto };
      applyThesis(data.thesis);
      setEditingConditionId(null);
    } finally {
      setBusy(false);
    }
  }

  async function removeCondition(conditionId: string) {
    if (load.status !== "ready" || !load.thesis) return;
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch(
        `/api/thesis/${load.thesis.id}/conditions/${conditionId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      if (!res.ok) {
        setBanner(await parseError(res));
        return;
      }
      const data = (await res.json()) as { thesis: ThesisDto };
      applyThesis(data.thesis);
    } finally {
      setBusy(false);
    }
  }

  async function reorder(orderedIds: string[]) {
    if (load.status !== "ready" || !load.thesis) return;
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch(
        `/api/thesis/${load.thesis.id}/conditions/reorder`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedIds }),
        }
      );
      if (!res.ok) {
        setBanner(await parseError(res));
        return;
      }
      const data = (await res.json()) as { thesis: ThesisDto };
      applyThesis(data.thesis);
    } finally {
      setBusy(false);
    }
  }

  function moveCondition(conditionId: string, dir: -1 | 1) {
    if (load.status !== "ready" || !load.thesis) return;
    const ids = load.thesis.conditions.map((c) => c.id);
    const idx = ids.indexOf(conditionId);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= ids.length) return;
    const copy = [...ids];
    const [item] = copy.splice(idx, 1);
    copy.splice(next, 0, item!);
    void reorder(copy);
  }

  if (load.status === "loading") {
    return (
      <div
        className="rounded-xl border border-zinc-800 px-4 py-8 text-center text-[13px] text-zinc-500"
        data-testid="thesis-loading"
      >
        Loading thesis…
      </div>
    );
  }

  if (load.status === "unauthorized") {
    return (
      <section
        className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-3 text-center"
        data-testid="thesis-unauthorized"
      >
        <h2 className="text-sm font-semibold text-zinc-200">
          Investment Thesis
        </h2>
        <p className="text-[13px] text-zinc-500 max-w-md mx-auto leading-relaxed">
          Sign in with an active TrustTicker plan to write and monitor your
          thesis for {sym}.
        </p>
        <div className="flex justify-center gap-2">
          <Link href="/login">
            <Button size="sm">Sign in</Button>
          </Link>
          <Link href="/pricing">
            <Button size="sm" variant="outline">
              View plans
            </Button>
          </Link>
        </div>
      </section>
    );
  }

  if (load.status === "error") {
    return (
      <div
        className="rounded-xl border border-rose-500/30 px-4 py-6 text-center space-y-3"
        data-testid="thesis-error"
      >
        <p className="text-[13px] text-rose-200">{load.message}</p>
        <Button size="sm" variant="outline" onClick={() => void refresh()}>
          Retry
        </Button>
      </div>
    );
  }

  const thesis = load.thesis;

  if (!thesis) {
    return (
      <section className="space-y-4" data-testid="thesis-empty">
        <header>
          <h2 className="text-lg font-semibold text-zinc-100">
            Investment Thesis
          </h2>
          <p className="text-[13px] text-zinc-500 mt-2 leading-relaxed max-w-prose">
            Write down why you own this company. TrustTicker can monitor the
            measurable parts.
          </p>
        </header>
        <textarea
          className="w-full min-h-[100px] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-[13px] text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          placeholder="e.g. Durable revenue growth, manageable dilution, and a product customers keep buying…"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          data-testid="thesis-note-input"
        />
        {banner ? (
          <p className="text-[12px] text-rose-300" data-testid="thesis-banner">
            {banner}
          </p>
        ) : null}
        <Button
          size="sm"
          disabled={busy}
          onClick={() => void createThesis()}
          data-testid="thesis-create"
        >
          Create thesis
        </Button>
      </section>
    );
  }

  const editingCondition = thesis.conditions.find(
    (c) => c.id === editingConditionId
  );

  return (
    <section className="space-y-5" data-testid="thesis-panel">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-100">
            Investment Thesis
          </h2>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void refresh()}
            data-testid="thesis-refresh"
          >
            Refresh
          </Button>
        </div>
        <p
          className="text-[12px] text-zinc-400"
          data-testid="thesis-health-summary"
        >
          {formatHealthSummaryLine(thesis.healthSummary)}
        </p>
      </header>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[12px] font-medium text-zinc-300">Your note</h3>
          {!editingNote ? (
            <button
              type="button"
              className="text-[11px] text-emerald-400 hover:underline"
              onClick={() => setEditingNote(true)}
              data-testid="thesis-edit-note"
            >
              Edit note
            </button>
          ) : null}
        </div>
        {editingNote ? (
          <>
            <textarea
              className="w-full min-h-[88px] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-[13px] text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              data-testid="thesis-note-input"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void saveNote()}
                data-testid="thesis-save-note"
              >
                Save note
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setNoteDraft(thesis.note ?? "");
                  setEditingNote(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <p
            className="text-[13px] text-zinc-400 leading-relaxed whitespace-pre-wrap"
            data-testid="thesis-note-display"
          >
            {thesis.note?.trim() ||
              "No note yet. Add why you own this company."}
          </p>
        )}
      </div>

      {banner ? (
        <p className="text-[12px] text-rose-300" data-testid="thesis-banner">
          {banner}
        </p>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-200">Conditions</h3>
          {!showBuilder && !editingConditionId ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setShowBuilder(true)}
              data-testid="thesis-add-condition"
            >
              Add condition
            </Button>
          ) : null}
        </div>

        {showBuilder ? (
          <ThesisConditionBuilder
            busy={busy}
            submitLabel="Add condition"
            onCancel={() => setShowBuilder(false)}
            onSubmit={addCondition}
          />
        ) : null}

        {editingCondition ? (
          <ThesisConditionBuilder
            busy={busy}
            submitLabel="Save condition"
            initial={{
              conditionType: editingCondition.conditionType,
              label: editingCondition.label,
              polarity: editingCondition.polarity as ConditionBuilderResult["polarity"],
              params: editingCondition.params,
            }}
            onCancel={() => setEditingConditionId(null)}
            onSubmit={(result) =>
              updateCondition(editingCondition.id, result)
            }
          />
        ) : null}

        {thesis.conditions.length === 0 && !showBuilder ? (
          <p className="text-[13px] text-zinc-500 border border-dashed border-zinc-700 rounded-lg px-3 py-6 text-center">
            Add measurable conditions TrustTicker can check — growth, share
            count, financing events, and more.
          </p>
        ) : null}

        <div className="space-y-3" data-testid="thesis-condition-list">
          {thesis.conditions.map((c, i) =>
            editingConditionId === c.id ? null : (
              <ThesisConditionCard
                key={c.id}
                condition={c}
                index={i}
                total={thesis.conditions.length}
                busy={busy}
                onEdit={() => {
                  setShowBuilder(false);
                  setEditingConditionId(c.id);
                }}
                onRemove={() => void removeCondition(c.id)}
                onMoveUp={() => moveCondition(c.id, -1)}
                onMoveDown={() => moveCondition(c.id, 1)}
              />
            )
          )}
        </div>
      </div>
    </section>
  );
}
