/**
 * Live quote stream → Redis quotes:v2 (works globally — no US residency required).
 * - Yahoo Finance batch quotes (~1.2s, free, no extra signup)
 * - Optional Finnhub WebSocket ticks when FINNHUB_API_KEY is set
 *
 * Usage: npm run quote:stream
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { Redis } from "@upstash/redis";

function loadEnvFile() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

loadEnvFile();

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || "";
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const POLL_MS = Number(process.env.QUOTE_STREAM_MS || 1_200);
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);
const CRON_SECRET = process.env.CRON_SECRET || "";
const USE_REDIS = Boolean(REDIS_URL && REDIS_TOKEN);
const USE_HTTP = !USE_REDIS;

const QUOTES_KEY = "quotes:v2";
const LIVE_STREAM_TS_KEY = "quotes:live:ts";
const FEED_KEY = "feed:all:v1";
const QUOTES_TTL_SEC = 45;
const YAHOO_BATCH = 40;

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

/** Yahoo v7 quotes require cookie + crumb; datacenter IPs often get 401/429 without them. */
let yahooAuth = { cookie: "", crumb: "", fetchedAt: 0 };
let yahooFailLogAt = 0;

const CORE_SYMBOLS = [
  "SPY",
  "QQQ",
  "IWM",
  "DIA",
  "AAPL",
  "MSFT",
  "NVDA",
  "TSLA",
  "AMD",
  "META",
  "AMZN",
  "GOOGL",
  "VIX",
];

if (USE_REDIS) {
  console.log("Quote stream → Redis", QUOTES_KEY);
} else {
  console.log(
    "Quote stream → HTTP",
    `${APP_URL}/api/quotes/ingest`,
    "(no Upstash — memory mode on Next server)"
  );
  if (!CRON_SECRET && process.env.NODE_ENV === "production") {
    console.warn("CRON_SECRET missing — HTTP ingest may reject in production");
  }
}

const redis = USE_REDIS ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN }) : null;

let pendingQuotes = {};
let flushTimer = null;
let yahooOffset = 0;
let finnhubWs = null;
let finnhubSubscribed = new Set();
let finnhubReconnectMs = 2_000;
/** In-memory quote map — avoids Redis GET on every flush (biggest command saver). */
let localQuotes = {};
let lastLiveTsWrite = 0;

function toYahooSymbol(sym) {
  return sym === "VIX" ? "^VIX" : sym;
}

function fromYahooSymbol(sym) {
  const s = String(sym).toUpperCase();
  return s === "^VIX" ? "VIX" : s;
}

function computeRvol(volume, avgVolume) {
  if (!volume || !avgVolume || avgVolume <= 0) return null;
  return Math.round((volume / avgVolume) * 10) / 10;
}

function repriceFromTick(existing, price) {
  if (
    existing?.price &&
    existing.changePercent != null &&
    Number.isFinite(existing.changePercent) &&
    Math.abs(existing.changePercent) < 500
  ) {
    const prevClose = existing.price / (1 + existing.changePercent / 100);
    if (prevClose > 0) {
      const change = price - prevClose;
      const changePercent = (change / prevClose) * 100;
      return { ...existing, price, change, changePercent };
    }
  }
  return {
    price,
    changePercent: existing?.changePercent ?? 0,
    change: existing?.change ?? 0,
    volume: existing?.volume,
    avgVolume: existing?.avgVolume,
    rVol: existing?.rVol,
    floatShares: existing?.floatShares,
    marketCap: existing?.marketCap,
  };
}

let redisDisabledUntil = 0;

async function flushQuotes() {
  const batch = pendingQuotes;
  pendingQuotes = {};
  const syms = Object.keys(batch);
  if (syms.length === 0) return;

  for (const sym of syms) {
    localQuotes[sym] = { ...(localQuotes[sym] || {}), ...batch[sym] };
  }

  if (USE_HTTP) {
    try {
      const headers = { "Content-Type": "application/json" };
      if (CRON_SECRET) headers.Authorization = `Bearer ${CRON_SECRET}`;
      const res = await fetch(`${APP_URL}/api/quotes/ingest`, {
        method: "POST",
        headers,
        body: JSON.stringify({ quotes: batch }),
      });
      if (!res.ok) {
        console.error(new Date().toISOString(), "http ingest", res.status);
      }
    } catch (err) {
      console.error(new Date().toISOString(), "http ingest error:", err?.message || err);
    }
    return;
  }

  if (Date.now() < redisDisabledUntil) return;

  try {
    const now = Date.now();
    const writes = [redis.set(QUOTES_KEY, localQuotes, { ex: QUOTES_TTL_SEC })];
    if (now - lastLiveTsWrite > 2_000) {
      lastLiveTsWrite = now;
      writes.push(redis.set(LIVE_STREAM_TS_KEY, now, { ex: 60 }));
    }
    await Promise.all(writes);
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes("max requests limit")) {
      redisDisabledUntil = Date.now() + 6 * 60 * 60_000;
      console.error(
        new Date().toISOString(),
        "Upstash free limit hit — pausing Redis writes for 6h (quotes stay in memory only)"
      );
      return;
    }
    console.error(new Date().toISOString(), "redis flush error:", msg);
  }
}

function scheduleFlush(ms = 1_000) {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQuotes();
  }, ms);
}

function queueQuote(sym, quote) {
  const key = sym.toUpperCase();
  const existing = pendingQuotes[key] || localQuotes[key];
  pendingQuotes[key] = existing
    ? { ...existing, ...quote, price: quote.price ?? existing.price }
    : quote;
  scheduleFlush(1_000);
}

function queueTick(sym, price) {
  const key = sym.toUpperCase();
  const existing = pendingQuotes[key] || localQuotes[key];
  pendingQuotes[key] = repriceFromTick(existing, price);
  scheduleFlush(1_000);
}

function rowToQuote(row) {
  const price =
    row.preMarketPrice ??
    row.regularMarketPrice ??
    row.postMarketPrice ??
    row.price;
  if (!price || price <= 0) return null;

  const changePercent =
    row.preMarketChangePercent ??
    row.regularMarketChangePercent ??
    row.postMarketChangePercent ??
    0;
  const change =
    row.preMarketChange ?? row.regularMarketChange ?? row.postMarketChange ?? 0;
  const volume = row.regularMarketVolume ?? row.preMarketVolume;
  const avgVolume = row.averageDailyVolume3Month ?? row.averageDailyVolume10Day;

  const dayHigh = row.regularMarketDayHigh;

  return {
    price,
    changePercent,
    change,
    volume: volume || undefined,
    avgVolume: avgVolume || undefined,
    rVol: computeRvol(volume, avgVolume),
    dayHigh: typeof dayHigh === "number" && dayHigh > 0 ? dayHigh : undefined,
  };
}

async function loadWatchSymbols() {
  const out = new Set(CORE_SYMBOLS);
  try {
    if (redis) {
      const feed = await redis.get(FEED_KEY);
      if (Array.isArray(feed)) {
        for (const row of feed.slice(0, 150)) {
          if (row?.symbol) out.add(String(row.symbol).toUpperCase());
        }
      }
    } else {
      const res = await fetch(`${APP_URL}/api/catalysts?limit=80`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : data?.items || data?.catalysts || [];
        if (Array.isArray(items)) {
          for (const row of items.slice(0, 150)) {
            if (row?.symbol) out.add(String(row.symbol).toUpperCase());
          }
        }
      }
    }
  } catch {
    /* core symbols only */
  }
  return [...out]
    .filter((s) => s === "VIX" || /^[A-Z]{1,5}$/.test(s))
    .slice(0, 200);
}

async function fetchYahooBatch(symbols) {
  if (symbols.length === 0) return;
  const joined = symbols.map(toYahooSymbol).join(",");
  const urls = [
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(joined)}`,
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(joined)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(6_000) });
      if (!res.ok) continue;
      const data = await res.json();
      const rows = data?.quoteResponse?.result;
      if (!Array.isArray(rows) || rows.length === 0) continue;
      for (const row of rows) {
        const sym = fromYahooSymbol(row.symbol);
        const quote = rowToQuote(row);
        if (quote) queueQuote(sym, quote);
      }
      return;
    } catch {
      /* try next host */
    }
  }
  console.warn(new Date().toISOString(), "yahoo batch failed for", symbols.length, "symbols");
}

function symbolHeat(sym) {
  const q = localQuotes[sym];
  if (!q) return 0;
  const rVol = Number(q.rVol) || 0;
  const move = Math.abs(Number(q.changePercent) || 0);
  const vol = Number(q.volume) || 0;
  const volScore = vol > 0 ? Math.log10(vol) : 0;
  // Heavy volume / large movers get polled every cycle
  return rVol * 12 + move * 1.5 + volScore;
}

async function yahooPollLoop() {
  const all = await loadWatchSymbols();
  if (all.length === 0) return;

  // Always refresh the hottest names; rotate the rest so volume stays live.
  const ranked = [...all].sort((a, b) => symbolHeat(b) - symbolHeat(a));
  const hot = ranked.filter((s) => symbolHeat(s) >= 8).slice(0, 16);
  const rest = ranked.filter((s) => !hot.includes(s));
  const start = yahooOffset % Math.max(1, rest.length);
  const rotate = [];
  for (let i = 0; i < YAHOO_BATCH - hot.length && i < rest.length; i++) {
    rotate.push(rest[(start + i) % rest.length]);
  }
  yahooOffset = rest.length ? (start + rotate.length) % rest.length : 0;

  const batch = [...new Set([...hot, ...rotate])];
  await fetchYahooBatch(batch);
}

async function seedFinnhubQuotes(symbols) {
  if (!FINNHUB_KEY) return;
  const need = symbols.filter((s) => s !== "VIX").slice(0, 12);
  for (const sym of need) {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(FINNHUB_KEY)}`,
        { signal: AbortSignal.timeout(4_000) }
      );
      if (!res.ok) continue;
      const q = await res.json();
      if (!q?.c || q.c <= 0) continue;
      queueQuote(sym, {
        price: q.c,
        change: q.d ?? 0,
        changePercent: q.dp ?? 0,
      });
      await new Promise((r) => setTimeout(r, 400));
    } catch {
      /* skip */
    }
  }
  await flushQuotes();
}

function subscribeFinnhub(symbols) {
  if (!finnhubWs || finnhubWs.readyState !== WebSocket.OPEN) return;
  const fresh = symbols.filter((s) => !finnhubSubscribed.has(s) && s !== "VIX").slice(0, 50);
  if (fresh.length === 0) return;
  for (const sym of fresh) {
    finnhubSubscribed.add(sym);
    finnhubWs.send(JSON.stringify({ type: "subscribe", symbol: sym }));
  }
  console.log(new Date().toISOString(), "finnhub ws subscribed +", fresh.length);
}

function connectFinnhub() {
  if (!FINNHUB_KEY) return;

  finnhubWs = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(FINNHUB_KEY)}`);

  finnhubWs.on("open", () => {
    console.log(new Date().toISOString(), "finnhub websocket connected");
    finnhubReconnectMs = 2_000;
    finnhubSubscribed = new Set();
    void loadWatchSymbols().then(async (symbols) => {
      await seedFinnhubQuotes(symbols);
      subscribeFinnhub(symbols);
    });
  });

  finnhubWs.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type === "trade" && Array.isArray(msg.data)) {
      for (const trade of msg.data) {
        if (trade.s && trade.p > 0) queueTick(String(trade.s).toUpperCase(), trade.p);
      }
    }
  });

  finnhubWs.on("close", () => {
    console.warn(
      new Date().toISOString(),
      `finnhub ws disconnected — retry in ${finnhubReconnectMs}ms`
    );
    finnhubSubscribed = new Set();
    setTimeout(connectFinnhub, finnhubReconnectMs);
    finnhubReconnectMs = Math.min(finnhubReconnectMs * 1.5, 30_000);
  });

  finnhubWs.on("error", (err) => {
    console.error(new Date().toISOString(), "finnhub ws error:", err.message);
  });
}

console.log(
  `Quote stream → ${USE_REDIS ? "Redis" : "HTTP"} (Yahoo${FINNHUB_KEY ? " + Finnhub WS" : ""}, poll ${POLL_MS}ms)`
);

if (redis) {
  try {
    const existing = (await redis.get(QUOTES_KEY)) || {};
    if (existing && typeof existing === "object") localQuotes = existing;
  } catch {
    /* start empty */
  }
}

void yahooPollLoop();
setInterval(() => void yahooPollLoop(), POLL_MS);
connectFinnhub();

setInterval(async () => {
  try {
    const symbols = await loadWatchSymbols();
    subscribeFinnhub(symbols);
  } catch {
    /* ignore */
  }
}, 20_000);
