import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = normalizeEmail(String(credentials.email));
        const password = String(credentials.password);
        if (password.length > 72) return null;

        const h = await headers();
        const ip =
          h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          h.get("x-real-ip") ||
          "unknown";

        // Brute-force protection: per IP and per email
        const [ipLimit, emailLimit] = await Promise.all([
          rateLimit(`login:ip:${ip}`, 20, 15 * 60_000),
          rateLimit(`login:email:${email}`, 10, 15 * 60_000),
        ]);
        if (!ipLimit.ok || !emailLimit.ok) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      // Prefer public app URL when NEXTAUTH_URL is wrongly set to localhost in prod
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || baseUrl).replace(/\/$/, "");
      const effectiveBase =
        process.env.NODE_ENV === "production" && appUrl && !appUrl.includes("localhost")
          ? appUrl
          : baseUrl;

      if (url.startsWith("/")) return `${effectiveBase}${url}`;
      try {
        const target = new URL(url);
        const allowed = new URL(effectiveBase);
        if (target.origin === allowed.origin) return url;
        // Block redirects to localhost from production
        if (
          process.env.NODE_ENV === "production" &&
          (target.hostname === "localhost" || target.hostname === "127.0.0.1")
        ) {
          return effectiveBase;
        }
      } catch {
        /* fall through */
      }
      return effectiveBase;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
