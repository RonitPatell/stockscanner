import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { sendEmail, emailShell } from "@/lib/email";

export const dynamic = "force-dynamic";

const TOPICS = new Set(["help", "suggestion", "request", "other"]);
const FOUNDER_INBOX =
  process.env.FOUNDER_CHAT_EMAIL?.trim() || "ronitpat@trustticker.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Public founder inbox — rate-limited. Never echoes secrets.
 * Emails FOUNDER_CHAT_EMAIL (default ronitpat@trustticker.com).
 * Optional Discord notify via FOUNDER_CHAT_WEBHOOK.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = await rateLimit(`founder-chat:${ip}`, 5, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many messages. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 5) }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Honeypot
  if (typeof body.company === "string" && body.company.trim()) {
    return NextResponse.json({ ok: true });
  }

  const email = String(body.email || "")
    .trim()
    .toLowerCase()
    .slice(0, 200);
  const name = String(body.name || "")
    .trim()
    .slice(0, 80);
  const message = String(body.message || "")
    .trim()
    .slice(0, 4_000);
  const topicRaw = String(body.topic || "help")
    .trim()
    .toLowerCase();
  const topic = TOPICS.has(topicRaw) ? topicRaw : "other";
  const pagePath = String(body.pagePath || "")
    .trim()
    .slice(0, 200);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (message.length < 10) {
    return NextResponse.json(
      { error: "Message too short — tell us what you need." },
      { status: 400 }
    );
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const ua = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  const row = await prisma.founderMessage.create({
    data: {
      userId,
      email,
      name: name || null,
      topic,
      message,
      pagePath: pagePath || null,
      userAgent: ua,
    },
    select: { id: true, createdAt: true },
  });

  const fromLine = name ? `${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;` : escapeHtml(email);
  const bodyHtml = `
    <p><strong>Topic:</strong> ${escapeHtml(topic)}</p>
    <p><strong>From:</strong> ${fromLine}</p>
    <p><strong>Page:</strong> ${escapeHtml(pagePath || "—")}</p>
    <p><strong>Id:</strong> ${escapeHtml(row.id)}</p>
    <hr style="border:none;border-top:1px solid #27272a;margin:16px 0" />
    <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
  `;
  void sendEmail(
    FOUNDER_INBOX,
    `[TrustTicker] Founder chat · ${topic} · ${email}`,
    emailShell("Founder chat", bodyHtml)
  ).catch(() => {});

  const webhook = process.env.FOUNDER_CHAT_WEBHOOK?.trim();
  if (webhook?.startsWith("https://")) {
    void fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: null,
        embeds: [
          {
            title: `Founder chat · ${topic}`,
            description: message.slice(0, 1500),
            fields: [
              { name: "From", value: name ? `${name} <${email}>` : email },
              { name: "Page", value: pagePath || "—" },
              { name: "Id", value: row.id },
            ],
            color: 0x10b981,
          },
        ],
      }),
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    id: row.id,
    message: "Got it — Ron will see this and get back to you.",
  });
}
