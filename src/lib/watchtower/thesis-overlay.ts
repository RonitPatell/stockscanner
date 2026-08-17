/**
 * User-specific Watchtower thesis overlay.
 * Same CompanyEvent row; different relevance per user's conditions.
 * Never stores or returns thesis note/premise text.
 */

import type { ThesisRelevanceDto } from "../ticker-what-changed/types.ts";
import type { ThesisConditionOverlayInput } from "../ticker-what-changed/types.ts";
import {
  scoreThesisRelevance,
  sanitizeThesisRelevanceForClient,
} from "../ticker-what-changed/thesis-overlay.ts";
import type { WatchtowerEventDto } from "./types.ts";

export function overlayWatchtowerThesisRelevance(opts: {
  event: Pick<WatchtowerEventDto, "eventType" | "category" | "title">;
  conditions: ThesisConditionOverlayInput[];
}): ThesisRelevanceDto {
  return sanitizeThesisRelevanceForClient(
    scoreThesisRelevance({
      event: {
        eventType: opts.event.eventType,
        category: opts.event.category,
        title: opts.event.title,
      },
      conditions: opts.conditions,
    })
  )!;
}

export function isThesisRelevant(rel: ThesisRelevanceDto | null | undefined): boolean {
  return rel?.status === "matches_condition" || rel?.status === "related_category";
}

export function isNeedsReviewEvent(event: WatchtowerEventDto): boolean {
  if (event.significance.level === "HIGH") return true;
  const rel = event.thesisRelevance;
  if (!rel || rel.status === "none") return false;
  return (
    rel.status === "matches_condition" &&
    (rel.polarity === "risk_if" || rel.polarity === "invalidate_if")
  );
}

export function applyWatchtowerClientFilter(
  items: WatchtowerEventDto[],
  filter: string
): WatchtowerEventDto[] {
  if (filter === "thesis_relevant") {
    return items.filter((i) => isThesisRelevant(i.thesisRelevance));
  }
  if (filter === "needs_review") {
    return items.filter((i) => isNeedsReviewEvent(i));
  }
  return items;
}

export function thesisRelevanceCountLabel(
  rel: ThesisRelevanceDto | null | undefined
): string | null {
  if (!rel || rel.status === "none") return null;
  if (rel.status === "matches_condition" && rel.conditionLabel) {
    return `Relevant to 1 thesis condition`;
  }
  if (rel.status === "related_category") {
    return "Related to a thesis condition";
  }
  return null;
}
