import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://trustticker.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/", "/wins", "/today", "/demo", "/pricing", "/ticker/"] },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
