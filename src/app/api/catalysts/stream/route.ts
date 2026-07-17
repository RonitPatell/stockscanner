import { NextRequest } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { getCatalysts } from "@/lib/catalyst-engine";
import { getCachedFeed } from "@/lib/feed-cache";
import { feedFingerprint } from "@/lib/feed-fingerprint";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Poll cache every 2s; only push when fingerprint changes. */
const POLL_MS = 2_000;

export async function GET(req: NextRequest) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const moversOnly = req.nextUrl.searchParams.get("moversOnly") === "true";
  const encoder = new TextEncoder();
  let closed = false;
  let lastFp = "";

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send({ type: "connected", timestamp: new Date().toISOString() });

      const poll = async () => {
        if (closed) return;
        try {
          const cacheKey = moversOnly ? "movers" : "all";
          const { items } = await getCachedFeed(cacheKey);
          const catalysts =
            items.length > 0
              ? items.slice(0, 150)
              : await getCatalysts(150, { moversOnly });
          if (catalysts.length === 0) return;

          const fp = feedFingerprint(catalysts);
          if (fp === lastFp) return;
          lastFp = fp;
          send({
            type: "update",
            catalysts,
            fingerprint: fp,
            timestamp: new Date().toISOString(),
          });
        } catch {
          send({ type: "error", message: "Poll failed" });
        }
      };

      await poll();
      const interval = setInterval(poll, POLL_MS);

      const heartbeat = setInterval(() => {
        send({ type: "heartbeat", timestamp: new Date().toISOString() });
      }, 12_000);

      const cleanup = () => {
        closed = true;
        clearInterval(interval);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

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
