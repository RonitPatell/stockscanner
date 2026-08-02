import { NextRequest } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { isValidTickerFormat } from "@/lib/ticker-utils";
import { isQuotableMarketSymbol } from "@/lib/index-quotes";
import {
  getCachedQuotes,
  isLiveQuoteStreamFresh,
  type CachedQuote,
} from "@/lib/quote-cache-service";
import { estimateRvolFromMove } from "@/lib/volume-utils";
import {
  SSE_ENTITLEMENT_RECHECK_MS,
  userStillHasPro,
} from "@/lib/sse-entitlement";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseSymbols(raw: string | null): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0 && (isValidTickerFormat(s) || isQuotableMarketSymbol(s)))
    ),
  ].slice(0, 96);
}

function withRvolEstimates(
  quotes: Record<string, CachedQuote>,
  symbols: string[]
): Record<string, CachedQuote> {
  const out = { ...quotes };
  for (const sym of symbols) {
    const q = out[sym];
    if (!q?.price || q.rVol != null) continue;
    const est = estimateRvolFromMove(q.changePercent);
    if (est != null) out[sym] = { ...q, rVol: est };
  }
  return out;
}

export async function GET(req: NextRequest) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const userId = gate.user.id;
  const symbols = parseSymbols(req.nextUrl.searchParams.get("symbols"));
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
          if (symbols.length === 0) return;
          const quotes = withRvolEstimates(await getCachedQuotes(symbols), symbols);
          if (Object.keys(quotes).length > 0) {
            send({
              type: "quotes",
              quotes,
              live: await isLiveQuoteStreamFresh(),
              timestamp: new Date().toISOString(),
            });
          }
        } catch {
          send({ type: "error", message: "Quote poll failed" });
        }
      };

      await poll();
      const live = await isLiveQuoteStreamFresh();
      interval = setInterval(poll, live ? 500 : 1_000);

      heartbeat = setInterval(() => {
        send({ type: "heartbeat", timestamp: new Date().toISOString() });
      }, 15_000);

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
