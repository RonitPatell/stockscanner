import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, phoneNumber } = await req.json();

    if (!email || !password || !phoneNumber) {
      return NextResponse.json(
        { error: "Email, password, and phone number are required" },
        { status: 400 }
      );
    }

    const phone = normalizePhone(phoneNumber);
    if (phone.length < 10) {
      return NextResponse.json({ error: "Enter a valid phone number" }, { status: 400 });
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const existingPhone = await prisma.user.findUnique({ where: { phoneNumber: phone } });
    if (existingPhone) {
      return NextResponse.json({ error: "Phone number already registered" }, { status: 409 });
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
