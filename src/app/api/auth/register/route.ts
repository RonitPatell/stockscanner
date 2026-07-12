import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = await rateLimit(`register:ip:${ip}`, 5, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many registration attempts. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 5) }
    );
  }

  try {
    const body = await req.json();
    const email = normalizeEmail(String(body.email ?? ""));
    const password = String(body.password ?? "");
    const name = body.name != null ? String(body.name).slice(0, 80) : undefined;
    const phoneRaw = String(body.phoneNumber ?? "");

    if (!email || !password || !phoneRaw) {
      return NextResponse.json(
        { error: "Email, password, and phone number are required" },
        { status: 400 }
      );
    }

    if (!EMAIL_RE.test(email) || email.length > 254) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }

    if (password.length < 8 || password.length > 72) {
      return NextResponse.json(
        { error: "Password must be 8–72 characters" },
        { status: 400 }
      );
    }

    const phone = normalizePhone(phoneRaw);
    if (phone.length < 10 || phone.length > 15) {
      return NextResponse.json({ error: "Enter a valid phone number" }, { status: 400 });
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    const existingPhone = await prisma.user.findUnique({ where: { phoneNumber: phone } });
    if (existingEmail || existingPhone) {
      // Same message — reduces account enumeration
      return NextResponse.json(
        { error: "Unable to register with those details" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name, phoneNumber: phone },
    });

    return NextResponse.json({ id: user.id, email: user.email });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
