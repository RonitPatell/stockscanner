"use client";

import { Star, TrendingDown, TrendingUp, Minus, HelpCircle, AlertTriangle } from "lucide-react";
import type { CatalystItem } from "@/types";
import {
  projectCatalystFeedRowV3,
  FEED_V3_COLORS,
  type FeedV3DisplayPrefs,
  type DirectionalImplication,
} from "@/lib/catalyst-feed-v3";
import {
  deskRatingBadgeClass,
  type DeskLetter,
} from "@/lib/desk-rating";
import { selectCollapsedContextBadges } from "@/lib/visual-system";
import { cn } from "@/lib/utils";

function DirectionIcon({
  direction,
}: {
  direction: DirectionalImplication;
}) {
  if (direction === "Positive") {
    return <TrendingUp className="tt-icon-sm shrink-0" aria-hidden />;
  }
  if (direction === "Negative") {
    return <TrendingDown className="tt-icon-sm shrink-0" aria-hidden />;
  }
  if (direction === "Mixed") {
    return <Minus className="tt-icon-sm shrink-0" aria-hidden />;
  }
  return <HelpCircle className="tt-icon-sm shrink-0" aria-hidden />;
}

function directionTone(direction: DirectionalImplication) {
  if (direction === "Positive") return FEED_V3_COLORS.positive;
  if (direction === "Negative") return FEED_V3_COLORS.negative;
  if (direction === "Mixed") return FEED_V3_COLORS.risk;
  return FEED_V3_COLORS.meta;
}

function formatMove(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * Collapsed Catalyst Feed V3 row — three-second scan layout.
 * Max three context badges; secondary detail lives in the Decision Drawer.
 * Presentation only; classification comes from existing projectors.
 */
export function CatalystFeedRowV3({
  catalyst,
  highlighted = false,
  inWatchlist = false,
  muted = false,
  prefs,
  nowMs,
  onActivate,
  className,
}: {
  catalyst: CatalystItem;
  highlighted?: boolean;
  inWatchlist?: boolean;
  muted?: boolean;
  prefs?: FeedV3DisplayPrefs;
  nowMs?: number;
  onActivate?: (c: CatalystItem) => void;
  className?: string;
}) {
  const row = projectCatalystFeedRowV3(catalyst, {
    nowMs,
    inWatchlist,
    muted,
    prefs,
  });
  const tone = directionTone(row.direction);
  const moveTone =
    row.changePercent != null && row.changePercent > 0
      ? FEED_V3_COLORS.positive
      : row.changePercent != null && row.changePercent < 0
        ? FEED_V3_COLORS.negative
        : FEED_V3_COLORS.meta;

  const badges = selectCollapsedContextBadges({
    reactionStageLabel: row.reactionStageLabel ?? "",
    tradeabilityLabel: row.tradeabilityLabel ?? "",
    topRiskLabel: row.topRiskLabel ?? "No major capital risk",
    verificationLabel: row.verificationLabel ?? undefined,
    materialityLabel: row.materialityLabel ?? undefined,
  });

  return (
    <article
      role="button"
      tabIndex={highlighted ? 0 : -1}
      data-feed-row-v3="true"
      data-catalyst-id={row.id}
      data-direction={row.direction}
      data-selected={highlighted ? "true" : "false"}
      data-badge-count={badges.length}
      aria-label={`${row.symbol} ${formatMove(row.changePercent)}, ${row.direction}, ${row.ageLabel}. ${row.headline}`}
      onClick={() => onActivate?.(catalyst)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate?.(catalyst);
        }
      }}
      className={cn("tt-feed-row", muted && "opacity-50", className)}
    >
      {/* Primary line */}
      <div className="tt-stack-meta tt-feed-primary">
        <span className="tt-inline-tight font-semibold tracking-tight shrink-0 w-[4.5rem]">
          {row.symbol}
          {row.inWatchlist && (
            <Star
              className="tt-icon-xs tt-tone-brand fill-current"
              aria-label="On watchlist"
            />
          )}
        </span>
        <span
          className={cn("tt-num shrink-0 w-[4.75rem]", moveTone.text)}
          aria-label={`Move ${formatMove(row.changePercent)}`}
        >
          {formatMove(row.changePercent)}
        </span>
        <span
          className={cn(
            "tt-inline-tight font-medium shrink-0",
            tone.text
          )}
        >
          <DirectionIcon direction={row.direction} />
          <span>{row.direction}</span>
        </span>
        {row.extras.gradeLetter && (
          <span
            className={cn(
              "ml-1 inline-flex items-center justify-center min-w-[1.35rem] h-5 px-1 rounded border text-[10px] font-bold shrink-0",
              deskRatingBadgeClass(row.extras.gradeLetter as DeskLetter)
            )}
            title={
              row.extras.gradeWhy
                ? `${row.extras.gradeLabel} — ${row.extras.gradeWhy}`
                : row.extras.gradeLabel ?? undefined
            }
            data-testid="desk-grade"
          >
            {row.extras.gradeLetter}
          </span>
        )}
        <span className={cn("ml-auto tt-num shrink-0 tt-meta")}>
          {row.ageLabel}
        </span>
      </div>

      <p className="mt-2 tt-feed-headline line-clamp-2">{row.headline}</p>

      {/* Max three context badges */}
      <div
        className="tt-stack-meta mt-2"
        data-testid="feed-row-badges"
        aria-label="Context"
      >
        {badges.map((b) => (
          <span
            key={b.id}
            className="tt-badge"
            data-tone={b.tone}
            data-badge-id={b.id}
          >
            {b.icon === "risk" && (
              <AlertTriangle className="tt-icon-xs" aria-hidden />
            )}
            <span className="truncate">{b.label}</span>
          </span>
        ))}
      </div>

      {/* Float / mcap / grade label — scan-critical size data */}
      {(row.extras.floatLabel ||
        row.extras.marketCapLabel ||
        row.extras.gradeLabel ||
        row.extras.sentimentScore != null ||
        row.extras.gapper ||
        row.extras.internalSource ||
        row.extras.allRiskLabels.length > 0) && (
        <p className="mt-1 tt-meta">
          {[
            row.extras.floatLabel,
            row.extras.marketCapLabel,
            row.extras.gradeLabel,
            row.extras.sentimentScore != null
              ? `Sentiment ${row.extras.sentimentScore}`
              : null,
            row.extras.gapper ? "Gapper" : null,
            row.extras.internalSource,
            ...row.extras.allRiskLabels,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </article>
  );
}
