const MIN_INTERVAL_MS = 1_150; // ~52 calls/min — stay under Finnhub free 60/min
let lastCallAt = 0;
let chain: Promise<void> = Promise.resolve();

/** Separate throttle for live price ticks so they don't wait behind heavy ingest/profile calls */
const LIVE_MIN_INTERVAL_MS = 350;
let liveLastCallAt = 0;
let liveChain: Promise<void> = Promise.resolve();

export async function finnhubFetch(url: string, init?: RequestInit): Promise<Response> {
  await (chain = chain.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
  }));

  const res = await fetch(url, { cache: "no-store", ...init });
  if (res.status === 429) {
    await sleep(3_000);
    return fetch(url, { cache: "no-store", ...init });
  }
  return res;
}

/** Quote-only fetches for the live feed — faster path, still paced */
export async function finnhubFetchLive(url: string, init?: RequestInit): Promise<Response> {
  await (liveChain = liveChain.then(async () => {
    const wait = liveLastCallAt + LIVE_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    liveLastCallAt = Date.now();
  }));

  const res = await fetch(url, { cache: "no-store", ...init });
  if (res.status === 429) {
    await sleep(4_000);
    return fetch(url, { cache: "no-store", ...init });
  }
  return res;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
