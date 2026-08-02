import { NextRequest, NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import {
  SSE_ENTITLEMENT_RECHECK_MS,
  userStillHasPro,
} from "@/lib/sse-entitlement";
import { getMonitorDeliveryHub } from "@/lib/monitor/delivery/server-hub";
import {
  isMonitorGloballyDisabled,
  isMonitorLiveDeliveryEnabled,
} from "@/lib/monitor/flags";
import {
  monitorStreamClientConnected,
  monitorStreamClientDisconnected,
} from "@/lib/monitor/ops/active-clients";
import { loadMonitorOpsControls } from "@/lib/monitor/ops/controls-store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const POLL_MS = 250;
const HEARTBEAT_MS = 12_000;
const MAX_REPLAY = 256;

/**
 * Monitor SSE — gapless sync from SSR lastEventId → replay → live.
 * Calculations stay on the server hub; browsers only apply envelopes.
 */
export async function GET(req: NextRequest) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  await loadMonitorOpsControls();
  if (isMonitorGloballyDisabled() || !isMonitorLiveDeliveryEnabled()) {
    return NextResponse.json(
      { error: "Monitor stream unavailable" },
      { status: 503 }
    );
  }

  const userId = gate.user.id;
  const lastEventIdHeader = req.headers.get("last-event-id");
  const lastEventIdQuery = req.nextUrl.searchParams.get("lastEventId");
  const hasClientCursor = Boolean(
    (lastEventIdHeader || lastEventIdQuery || "").trim()
  );
  let afterSeq = Number(
    (lastEventIdHeader || lastEventIdQuery || "").trim() || "0"
  );
  if (!Number.isFinite(afterSeq) || afterSeq < 0) afterSeq = 0;

  const hub = getMonitorDeliveryHub();
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      monitorStreamClientConnected();
      const send = (data: unknown, id?: string) => {
        if (closed) return;
        try {
          let chunk = "";
          if (id) chunk += `id: ${id}\n`;
          chunk += `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      let interval: ReturnType<typeof setInterval> | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let entitlementTimer: ReturnType<typeof setInterval> | null = null;
      let countedDown = false;

      const cleanup = () => {
        if (!countedDown) {
          countedDown = true;
          monitorStreamClientDisconnected();
        }
        closed = true;
        if (interval) clearInterval(interval);
        if (heartbeat) clearInterval(heartbeat);
        if (entitlementTimer) clearInterval(entitlementTimer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const plan = hub.planResume(afterSeq, MAX_REPLAY);
      let replayed = 0;

      send({
        type: "catchup_start",
        id: `cu-start-${Date.now()}`,
        fromEventId: String(afterSeq),
        mode: plan.mode,
        reason: plan.reason,
      });

      if (plan.mode === "full_snapshot" || !hasClientCursor) {
        // Full snapshot only when gap cannot be replayed, or first connect without cursor.
        const snap = hub.latestSnapshot();
        if (plan.mode === "full_snapshot") {
          send(
            {
              type: "resync_required",
              id: String(snap.sequence || afterSeq),
              sequence: snap.sequence,
              reason: plan.reason,
              payload: snap,
            },
            String(snap.sequence || 0)
          );
        } else {
          send(
            {
              type: "snapshot",
              id: String(snap.sequence || afterSeq),
              sequence: snap.sequence,
              payload: snap,
            },
            String(snap.sequence || 0)
          );
        }
        afterSeq = Math.max(afterSeq, snap.sequence);
        replayed = 1;
      } else {
        // Gapless: replay permitted events after lastEventId in order.
        for (const msg of plan.messages) {
          if ("sequence" in msg) {
            send(msg, String(msg.sequence));
            afterSeq = Math.max(afterSeq, msg.sequence);
            replayed += 1;
          }
        }
      }

      send({
        type: "catchup_complete",
        id: `cu-done-${Date.now()}`,
        lastEventId: String(afterSeq),
        replayed,
      });

      send({
        type: "connected",
        lastEventId: afterSeq > 0 ? String(afterSeq) : null,
        heartbeatMs: HEARTBEAT_MS,
        syncPhase: "live",
      });

      const poll = () => {
        if (closed) return;
        const batch = hub.messagesAfter(afterSeq, 64);
        // Detect live gap (ring advanced past what we can read continuously).
        if (batch.length === 0) {
          const hubSeq = hub.currentSequence();
          const oldest = hub.ringSequences().sort((a, b) => a - b)[0];
          if (
            hubSeq > afterSeq &&
            oldest != null &&
            afterSeq + 1 < oldest
          ) {
            const snap = hub.latestSnapshot();
            send({
              type: "catchup_start",
              id: `cu-gap-${Date.now()}`,
              fromEventId: String(afterSeq),
              mode: "full_snapshot",
              reason: "ring_truncated",
            });
            send(
              {
                type: "resync_required",
                id: String(snap.sequence),
                sequence: snap.sequence,
                reason: "ring_truncated",
                payload: snap,
              },
              String(snap.sequence)
            );
            afterSeq = Math.max(afterSeq, snap.sequence);
            send({
              type: "catchup_complete",
              id: `cu-gap-done-${Date.now()}`,
              lastEventId: String(afterSeq),
              replayed: 1,
            });
          }
          return;
        }
        for (const msg of batch) {
          if ("sequence" in msg) {
            // Preserve order; client dedupes.
            if (msg.sequence > afterSeq + 1 && msg.type !== "snapshot") {
              // Hole mid-stream → bounded resync via snapshot.
              const snap = hub.latestSnapshot();
              send({
                type: "catchup_start",
                id: `cu-hole-${Date.now()}`,
                fromEventId: String(afterSeq),
                mode: "full_snapshot",
                reason: "sequence_hole",
              });
              send(
                {
                  type: "resync_required",
                  id: String(snap.sequence),
                  sequence: snap.sequence,
                  reason: "sequence_hole",
                  payload: snap,
                },
                String(snap.sequence)
              );
              afterSeq = Math.max(afterSeq, snap.sequence);
              send({
                type: "catchup_complete",
                id: `cu-hole-done-${Date.now()}`,
                lastEventId: String(afterSeq),
                replayed: 1,
              });
              return;
            }
            send(msg, String(msg.sequence));
            afterSeq = Math.max(afterSeq, msg.sequence);
          }
        }
      };

      interval = setInterval(poll, POLL_MS);
      heartbeat = setInterval(() => {
        const m = hub.metrics();
        send(
          {
            type: "heartbeat",
            id: `hb-${Date.now()}`,
            sequence: afterSeq,
            health: m.health,
            lagMs: Math.round(m.lagMsAvg),
            publishedAtMs: Date.now(),
            queueDepth: m.outboundQueueDepth,
          },
          String(afterSeq)
        );
      }, HEARTBEAT_MS);

      entitlementTimer = setInterval(() => {
        void (async () => {
          if (closed) return;
          const ok = await userStillHasPro(userId);
          if (!ok) {
            send({
              type: "entitlement_revoked",
              id: `ent-${Date.now()}`,
              code: "PRO_REQUIRED",
            });
            cleanup();
          }
        })();
      }, SSE_ENTITLEMENT_RECHECK_MS);

      req.signal.addEventListener("abort", cleanup);
      setTimeout(cleanup, 30 * 60_000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
