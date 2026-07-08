const MIN_INTERVAL_MS = 1_150; // ~52 calls/min — stay under Finnhub free 60/min
let lastCallAt = 0;
let chain: Promise<void> = Promise.resolve();

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
