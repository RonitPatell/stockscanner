import type { ReactionMetrics, TimelineEvent } from "./types.ts";
import type { ReactionStageCatalystInput } from "./types.ts";

export function buildReactionTimeline(
  input: ReactionStageCatalystInput,
  metrics: ReactionMetrics,
  stageLabel: string
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  if (metrics.providerPublishedAt) {
    events.push({
      id: "publication",
      kind: "publication",
      at: metrics.providerPublishedAt,
      label: "Publication",
      detail: `Provider timestamp quality: ${metrics.sourceTimestampQuality}`,
      meta: { quality: metrics.sourceTimestampQuality },
    });
  }

  if (metrics.firstSeenAt) {
    events.push({
      id: "first_ingestion",
      kind: "first_ingestion",
      at: metrics.firstSeenAt,
      label: "First ingestion",
      detail: "TrustTicker first saw the item",
    });
  }

  if (metrics.classifiedAt) {
    events.push({
      id: "classified",
      kind: "classified",
      at: metrics.classifiedAt,
      label: "Classified",
    });
  }

  if (metrics.userDeliveredAt) {
    events.push({
      id: "user_delivered",
      kind: "user_delivered",
      at: metrics.userDeliveredAt,
      label: "User delivered",
      detail: "First in-app / SSE delivery attempt",
    });
  }

  // Initial reaction: first time |move since publish| crosses 1% when known
  const move = metrics.pctMoveSincePublication.value;
  if (
    metrics.providerPublishedAt &&
    move != null &&
    Math.abs(move) >= 1 &&
    metrics.priceAtPublication.availability !== "unavailable"
  ) {
    events.push({
      id: "initial_reaction",
      kind: "initial_reaction",
      at: new Date(input.nowMs ?? Date.now()).toISOString(),
      label: "Initial reaction (observed)",
      detail: `Move since publication ${move.toFixed(1)}% (as-of compute)`,
      meta: { movePct: move },
    });
  }

  for (const a of input.alertEvents ?? []) {
    events.push({
      id: `alert_${a.at}`,
      kind: "alert",
      at: a.at,
      label: a.label,
      detail: a.detail,
    });
  }

  const haltN = metrics.haltCount.value;
  if (haltN != null && haltN > 0) {
    events.push({
      id: "halt",
      kind: "halt",
      at: new Date(input.nowMs ?? Date.now()).toISOString(),
      label: `Halt count ${haltN}`,
      detail: "From exchange feed when available; otherwise unavailable",
    });
  }

  for (const w of input.tape?.haltWindows ?? []) {
    events.push({
      id: `halt_window_${w[0]}`,
      kind: "halt",
      at: new Date(w[0] * 1000).toISOString(),
      label: "Halt window",
      detail: `Until ${new Date(w[1] * 1000).toISOString()}`,
    });
  }

  events.push({
    id: "stage_now",
    kind: "stage_change",
    at: new Date(input.nowMs ?? Date.now()).toISOString(),
    label: `Stage: ${stageLabel}`,
  });

  return events.sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
}
