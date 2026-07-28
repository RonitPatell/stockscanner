"use client";

import { AlertTriangle, HelpCircle, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { CatalystItem } from "@/types";
import {
  buildJudgmentV2,
  inferDirectionalImplication,
  presentJudgment,
} from "@/lib/judgment";
import { projectDecisionCardV3 } from "@/lib/decision-card/project";
import { selectCollapsedContextBadges } from "@/lib/visual-system";
import { cn, formatPercent } from "@/lib/utils";

/**
 * Focus Mode V2 row — what happened, materiality, reaction, tradeability, risk.
 * Uses shared visual tokens; max three context badges on the collapsed strip.
 */
export function FocusCatalystRowV2({
  catalyst,
  highlighted = false,
  nowMs,
  onActivate,
}: {
  catalyst: CatalystItem;
  highlighted?: boolean;
  nowMs?: number;
  onActivate?: (c: CatalystItem) => void;
}) {
  const now = nowMs ?? Date.now();
  const card = projectDecisionCardV3(catalyst, { nowMs: now });
  const p = presentJudgment({
    judgment: catalyst.judgmentV2 ?? buildJudgmentV2(catalyst),
    directionalImplication: inferDirectionalImplication(catalyst),
    reactionStage: card.reactionStage.stage,
    tradeability: card.tradeability.liquidity,
  });
  const headline =
    card.catalyst.factSummary || catalyst.headline || "Catalyst update";
  const move = catalyst.changePercent;

  const DirIcon =
    p.direction === "Positive"
      ? TrendingUp
      : p.direction === "Negative"
        ? TrendingDown
        : p.direction === "Mixed"
          ? Minus
          : HelpCircle;

  const badges = selectCollapsedContextBadges({
    reactionStageLabel: p.reactionStage,
    tradeabilityLabel: p.tradeability,
    topRiskLabel: p.topRisk ?? "No major capital risk",
    verificationLabel: undefined,
    materialityLabel: p.materiality,
  });

  return (
    <article
      role="button"
      tabIndex={highlighted ? 0 : -1}
      data-focus-row-v2="true"
      data-catalyst-id={catalyst.id}
      data-selected={highlighted ? "true" : "false"}
      aria-current={highlighted ? "true" : undefined}
      aria-label={`${catalyst.symbol}. ${headline}. Materiality ${p.materiality}. Reaction ${p.reactionStage}. Tradeability ${p.tradeability}. Risk ${p.topRisk ?? "none"}.`}
      onClick={() => onActivate?.(catalyst)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate?.(catalyst);
        }
      }}
      className="tt-feed-row"
      style={{ minHeight: 96 }}
    >
      <div className="tt-stack-meta">
        <span className="tt-inline-tight font-semibold text-[15px] tracking-tight tt-num">
          {catalyst.symbol.toUpperCase()}
        </span>
        <span
          className={cn(
            "tt-num text-[14px]",
            move != null && move > 0 && "tt-tone-positive",
            move != null && move < 0 && "tt-tone-negative",
            (move == null || move === 0) && "tt-tone-meta"
          )}
          aria-label={`Move ${move != null ? formatPercent(move) : "unavailable"}`}
        >
          {move != null ? formatPercent(move) : "—"}
        </span>
        <span
          className={cn(
            "tt-inline-tight text-[13px] font-medium",
            p.direction === "Positive" && "tt-tone-positive",
            p.direction === "Negative" && "tt-tone-negative",
            p.direction === "Mixed" && "tt-tone-risk",
            p.direction === "Unclear" && "tt-tone-meta"
          )}
        >
          <DirIcon className="tt-icon-sm" aria-hidden />
          {p.direction}
        </span>
      </div>

      <p className="mt-2 tt-feed-headline font-medium line-clamp-3">{headline}</p>

      <div className="tt-stack-meta mt-2" data-testid="focus-row-badges">
        {badges.map((b) => (
          <span key={b.id} className="tt-badge" data-tone={b.tone}>
            {b.icon === "risk" && (
              <AlertTriangle className="tt-icon-xs" aria-hidden />
            )}
            <span className="truncate">{b.label}</span>
          </span>
        ))}
      </div>
    </article>
  );
}
