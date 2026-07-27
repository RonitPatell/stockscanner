"use client";

import { useState } from "react";
import type { CatalystItem } from "@/types";
import {
  createDecisionRecord,
  saveLocalDecision,
  DECISION_REASONS,
  type DecisionAction,
  type DecisionReason,
  TRADER_FEEDBACK_EVENT,
} from "@/lib/trader-feedback";
import { Button } from "../ui/button";

interface Props {
  catalyst: CatalystItem;
  /** Optional projected card fields */
  reactionStage?: string | null;
  tradeability?: string | null;
  risks?: string[];
  alertRuleId?: string | null;
  alertStrategyId?: string | null;
  followedOwnRules?: boolean | null;
  className?: string;
}

export function DecisionFeedbackButtons({
  catalyst,
  reactionStage,
  tradeability,
  risks = [],
  alertRuleId,
  alertStrategyId,
  followedOwnRules,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<DecisionAction | null>(null);
  const [reason, setReason] = useState<DecisionReason | "">("");
  const [entryPrice, setEntryPrice] = useState(
    catalyst.price != null ? String(catalyst.price) : ""
  );
  const [exitPrice, setExitPrice] = useState("");
  const [size, setSize] = useState("1000");
  const [alertId, setAlertId] = useState("");
  const [followedRules, setFollowedRules] = useState<
    "unknown" | "yes" | "no"
  >(
    followedOwnRules === true
      ? "yes"
      : followedOwnRules === false
        ? "no"
        : "unknown"
  );
  const [saved, setSaved] = useState(false);

  const ageMin =
    catalyst.publishedAt && Number.isFinite(Date.parse(catalyst.publishedAt))
      ? (Date.now() - Date.parse(catalyst.publishedAt)) / 60_000
      : null;

  const start = (a: DecisionAction) => {
    setAction(a);
    setOpen(true);
    setSaved(false);
  };

  const commit = () => {
    if (!action) return;
    const record = createDecisionRecord({
      action,
      symbol: catalyst.symbol,
      catalystId: catalyst.id,
      headline: catalyst.headline,
      reason: reason || null,
      entryPrice:
        action === "entered" && entryPrice ? Number(entryPrice) : null,
      exitPrice: exitPrice ? Number(exitPrice) : null,
      positionSize: size ? Number(size) : null,
      side: action === "entered" ? "long" : null,
      alertId: alertId.trim() || null,
      alertRuleId: alertRuleId ?? null,
      alertStrategyId: alertStrategyId ?? null,
      context: {
        catalystAgeMin: ageMin,
        reactionStage: reactionStage ?? null,
        tradeability: tradeability ?? null,
        risksVisible: risks,
        moveCompletedBeforeEntryPct: catalyst.changePercent ?? null,
        priceAtDecision: catalyst.price ?? null,
        publishedAt: catalyst.publishedAt ?? null,
        catalystType: catalyst.catalystType ?? null,
        alertRuleId: alertRuleId ?? null,
        alertStrategyId: alertStrategyId ?? null,
        followedOwnRules:
          followedRules === "yes"
            ? true
            : followedRules === "no"
              ? false
              : null,
      },
    });
    saveLocalDecision(record);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(TRADER_FEEDBACK_EVENT));
    }
    setSaved(true);
    setOpen(false);
  };

  return (
    <div className={className} data-guide="trader-feedback">
      <div className="flex flex-wrap gap-1">
        {(
          [
            ["watched", "Watched"],
            ["entered", "Entered"],
            ["skipped", "Skipped"],
            ["ignored", "Ignored"],
          ] as const
        ).map(([a, label]) => (
          <Button
            key={a}
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[10px]"
            onClick={() => start(a)}
          >
            {label}
          </Button>
        ))}
      </div>

      {saved && (
        <p className="text-[10px] text-emerald-400/90 mt-1" role="status">
          Saved locally on this device.
        </p>
      )}

      {open && action && (
        <div className="mt-2 rounded border border-[--border] bg-black/30 p-2 space-y-2 text-[11px]">
          <p className="text-[--text-secondary]">
            Record <strong>{action}</strong> for {catalyst.symbol}. Local by
            default — not a brokerage order.
          </p>
          <label className="block text-[--text-muted]">
            Reason
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as DecisionReason | "")}
              className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
            >
              <option value="">—</option>
              {DECISION_REASONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {action === "entered" && (
            <div className="grid grid-cols-3 gap-1">
              <label className="text-[--text-muted]">
                Entry
                <input
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5"
                />
              </label>
              <label className="text-[--text-muted]">
                Exit
                <input
                  value={exitPrice}
                  onChange={(e) => setExitPrice(e.target.value)}
                  className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5"
                  placeholder="optional"
                />
              </label>
              <label className="text-[--text-muted]">
                Size $
                <input
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5"
                />
              </label>
            </div>
          )}
          <label className="block text-[--text-muted]">
            TrustTicker alert id (optional)
            <input
              value={alertId}
              onChange={(e) => setAlertId(e.target.value)}
              className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
              placeholder="Associate with an alert"
            />
          </label>
          <label className="block text-[--text-muted]">
            Followed your saved alert rules?
            <select
              value={followedRules}
              onChange={(e) =>
                setFollowedRules(e.target.value as "unknown" | "yes" | "no")
              }
              className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
            >
              <option value="unknown">Unknown</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="button" size="sm" className="h-7 text-[10px]" onClick={commit}>
              Save locally
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-[10px]"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
