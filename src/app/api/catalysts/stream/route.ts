import { NextRequest } from "next/server";
import { getCatalysts } from "@/lib/catalyst-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const moversOnly = req.nextUrl.searchParams.get("moversOnly") === "true";
  const encoder = new TextEncoder();
  let closed = false;

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
          const catalysts = await getCatalysts(150, { moversOnly });
          send({ type: "update", catalysts, timestamp: new Date().toISOString() });
        } catch {
          send({ type: "error", message: "Poll failed" });
        }
      };

      await poll();
      // Push fresh news every 5s without requiring a manual refresh
      const interval = setInterval(poll, 5_000);

      const heartbeat = setInterval(() => {
        send({ type: "heartbeat", timestamp: new Date().toISOString() });
      }, 12_000);

      const cleanup = () => {
        closed = true;
        clearInterval(interval);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch { /* already closed */ }
      };

      req.signal.addEventListener("abort", cleanup);
      // Keep stream open for long sessions; reconnect client-side after this
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
