import { resolveFinnhubKey } from "../finnhub-key.ts";
import { finnhubFetchLive } from "../finnhub-queue.ts";
import type { CandleBar, CandleSet } from "./candles.ts";

const FINNHUB_BASE = "https://finnhub.io/api/v1";

export async function fetchMinuteCandleSet(
  symbol: string,
  fromSec: number,
  toSec: number
): Promise<CandleSet | null> {
  const key = resolveFinnhubKey();
  if (!key) return null;
  try {
    const res = await finnhubFetchLive(
      `${FINNHUB_BASE}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=1&from=${fromSec}&to=${toSec}&token=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.s !== "ok" || !data.t?.length) return null;
    const bars: CandleBar[] = [];
    for (let i = 0; i < data.t.length; i++) {
      bars.push({
        t: data.t[i] as number,
        o: (data.o?.[i] as number) ?? (data.c?.[i] as number),
        h: (data.h?.[i] as number) ?? (data.c?.[i] as number),
        l: (data.l?.[i] as number) ?? (data.c?.[i] as number),
        c: data.c[i] as number,
        v: data.v?.[i] as number | undefined,
      });
    }
    return { bars };
  } catch {
    return null;
  }
}

export async function fetchDailyCandleSet(
  symbol: string,
  fromSec: number,
  toSec: number
): Promise<CandleSet | null> {
  const key = resolveFinnhubKey();
  if (!key) return null;
  try {
    const res = await finnhubFetchLive(
      `${FINNHUB_BASE}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${fromSec}&to=${toSec}&token=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.s !== "ok" || !data.t?.length) return null;
    const bars: CandleBar[] = [];
    for (let i = 0; i < data.t.length; i++) {
      bars.push({
        t: data.t[i] as number,
        o: (data.o?.[i] as number) ?? (data.c?.[i] as number),
        h: (data.h?.[i] as number) ?? (data.c?.[i] as number),
        l: (data.l?.[i] as number) ?? (data.c?.[i] as number),
        c: data.c[i] as number,
        v: data.v?.[i] as number | undefined,
      });
    }
    return { bars };
  } catch {
    return null;
  }
}
