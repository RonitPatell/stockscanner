import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { track } from "@/lib/analytics/track";
import { validateRegisterInput } from "@/lib/register-validation";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = await rateLimit(`register:ip:${ip}`, 5, 60 * 60_000, { strict: true });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many registration attempts. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 5) }
    );
  }

  try {
    const body = await req.json();
    const parsed = validateRegisterInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const existingEmail = await prisma.user.findUnique({ where: { email: parsed.email } });
    if (existingEmail) {
      return NextResponse.json(
        { error: "Unable to register with those details" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(parsed.password, 12);
    const user = await prisma.user.create({
      data: {
        email: parsed.email,
        passwordHash,
        name: parsed.name || null,
        phoneNumber: null,
        onboardingProgress: { version: 1 },
      },
    });

    void track("signup_completed");

    return NextResponse.json({ id: user.id, email: user.email });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
