import { NextRequest } from "next/server";
import { getCatalysts } from "@/lib/catalyst-engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const moversOnly = req.nextUrl.searchParams.get("moversOnly") === "true";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      send({ type: "connected", timestamp: new Date().toISOString() });

      const poll = async () => {
        try {
          const catalysts = await getCatalysts(80, { moversOnly });
          send({ type: "update", catalysts, timestamp: new Date().toISOString() });
        } catch {
          send({ type: "error", message: "Poll failed" });
        }
      };

      await poll();
      const interval = setInterval(poll, 20000);

      // Keep-alive heartbeat
      const heartbeat = setInterval(() => {
        send({ type: "heartbeat", timestamp: new Date().toISOString() });
      }, 15000);

      // Cleanup on close
      const cleanup = () => {
        clearInterval(interval);
        clearInterval(heartbeat);
      };

      setTimeout(cleanup, 300000); // 5 min max connection
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
