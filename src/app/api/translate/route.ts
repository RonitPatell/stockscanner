import { NextRequest, NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type CacheEntry = { ts: number; translated: string; detectedLang?: string };
type TranslationChunk = [unknown, ...unknown[]];
const cache = new Map<string, CacheEntry>();
const CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_TEXT = 500;

function cacheKey(text: string, to: string): string {
  return `${to}:${text}`;
}

/**
 * Free, no-key translation via Google "gtx" endpoint.
 * Best-effort only; returns original text on failure.
 */
async function translate(textRaw: string, toRaw: string) {
  const to = (toRaw || "en").slice(0, 8);
  const text = (textRaw || "").trim().slice(0, MAX_TEXT);
  if (!text) return { translated: "" };

  const key = cacheKey(text, to);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_MS) {
    return { translated: cached.translated, detectedLang: cached.detectedLang, cached: true };
  }

  const url =
    "https://translate.googleapis.com/translate_a/single" +
    `?client=gtx&sl=auto&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return { translated: text, error: "translate_failed" };
  }

  const data: unknown = await res.json();
  const payload = Array.isArray(data) ? data : [];
  const chunks = Array.isArray(payload[0]) ? payload[0] : [];
  const translated = chunks.length > 0
    ? chunks
        .filter((chunk): chunk is TranslationChunk => Array.isArray(chunk))
        .map((chunk) => String(chunk[0] ?? ""))
        .join("")
    : text;
  const detectedLang = typeof payload[2] === "string" ? payload[2] : undefined;

  cache.set(key, { ts: Date.now(), translated, detectedLang });
  return { translated, detectedLang };
}

export async function GET(req: NextRequest) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const ip = clientIp(req);
  const rl = await rateLimit(`translate:get:${gate.user.id}:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many translate requests" },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  try {
    const text = req.nextUrl.searchParams.get("text") ?? "";
    const to = req.nextUrl.searchParams.get("to") ?? "en";
    const result = await translate(text, to);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ translated: "", error: "bad_request" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const ip = clientIp(req);
  const rl = await rateLimit(`translate:post:${gate.user.id}:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many translate requests" },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  try {
    const raw = await req.text();
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const body = parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
    const text = typeof body.text === "string" ? body.text : "";
    const to = typeof body.to === "string" ? body.to : "en";
    const result = await translate(text, to);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ translated: "", error: "bad_request" }, { status: 400 });
  }
}
