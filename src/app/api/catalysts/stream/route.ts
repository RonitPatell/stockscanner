import { NextRequest } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { getCatalysts } from "@/lib/catalyst-engine";
import { getCachedFeed } from "@/lib/feed-cache";
import { feedFingerprint } from "@/lib/feed-fingerprint";
import { markTracesFirstDelivery } from "@/lib/latency-trace";
import { recordBrowserStreamHandshake } from "@/lib/system-health";
import { collapseStoryClusters } from "@/lib/story-cluster";
import {
  SSE_ENTITLEMENT_RECHECK_MS,
  userStillHasPro,
} from "@/lib/sse-entitlement";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Poll cache every 2s; only push when fingerprint changes. Polling is recovery when stream idle. */
const POLL_MS = 2_000;
const HEARTBEAT_MS = 12_000;

export async function GET(req: NextRequest) {
  const gate = await requirePro();
  if (gate.error) {
    recordBrowserStreamHandshake(false);
    return gate.error;
  }

  recordBrowserStreamHandshake(true);
  const userId = gate.user.id;

  const moversOnly = req.nextUrl.searchParams.get("moversOnly") === "true";
  const lastEventIdHeader = req.headers.get("last-event-id");
  const lastEventIdQuery = req.nextUrl.searchParams.get("lastEventId");
  let lastEventId = (lastEventIdHeader || lastEventIdQuery || "").trim();

  const encoder = new TextEncoder();
  let closed = false;
  let lastFp = "";
  const deliveredIds = new Set<string>();

  const stream = new ReadableStream({
    async start(controller) {
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

      send(
        {
          type: "connected",
          timestamp: new Date().toISOString(),
          lastEventId: lastEventId || null,
          heartbeatMs: HEARTBEAT_MS,
        },
        lastEventId || undefined
      );

      let interval: ReturnType<typeof setInterval> | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let entitlementTimer: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
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

      const poll = async () => {
        if (closed) return;
        try {
          const cacheKey = moversOnly ? "movers" : "all";
          const { items } = await getCachedFeed(cacheKey);
          const catalysts = collapseStoryClusters(
            items.length > 0
              ? items.slice(0, 150)
              : await getCatalysts(150, { moversOnly })
          );
          if (catalysts.length === 0) return;

          // Reconnect with Last-Event-ID: only emit items newer than cursor
          let toSend = catalysts;
          if (lastEventId) {
            const cursorMs = Date.parse(lastEventId);
            if (Number.isFinite(cursorMs)) {
              const newer = catalysts.filter(
                (c) => new Date(c.publishedAt).getTime() > cursorMs
              );
              if (newer.length > 0) toSend = newer;
            }
          }

          const fp = feedFingerprint(toSend.length === catalysts.length ? catalysts : toSend);
          if (fp === lastFp) return;
          lastFp = fp;

          const eventId = new Date().toISOString();
          send(
            {
              type: "update",
              catalysts: toSend.length > 0 ? toSend : catalysts,
              fingerprint: fp,
              timestamp: eventId,
              resumeFrom: lastEventId || null,
            },
            eventId
          );
          lastEventId = eventId;

          const freshIds = (toSend.length > 0 ? toSend : catalysts)
            .map((c) => c.id)
            .filter((id) => !deliveredIds.has(id));
          for (const id of freshIds) deliveredIds.add(id);
          if (freshIds.length > 0) {
            void markTracesFirstDelivery(freshIds).catch(() => {});
          }
        } catch {
          send({ type: "error", message: "Poll failed" });
        }
      };

      await poll();
      interval = setInterval(poll, POLL_MS);

      heartbeat = setInterval(() => {
        send({
          type: "heartbeat",
          timestamp: new Date().toISOString(),
        });
      }, HEARTBEAT_MS);

      entitlementTimer = setInterval(() => {
        void (async () => {
          if (closed) return;
          const ok = await userStillHasPro(userId);
          if (!ok) {
            send({ type: "entitlement_revoked", code: "PRO_REQUIRED" });
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
