/** Shared RSS helpers for wire/news scrapers */

export function parseRssItems(xml: string): {
  title: string;
  link: string;
  pubDate?: string;
  description: string;
}[] {
  const chunks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  return chunks.map((item) => {
    const title =
      item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1] ||
      item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
      "";
    const link =
      item.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>/i)?.[1] ||
      item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ||
      item.match(/<link[^>]+href="([^"]+)"/i)?.[1] ||
      "";
    const pubDate =
      item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ||
      item.match(/<dc:date>([\s\S]*?)<\/dc:date>/i)?.[1] ||
      item.match(/<published>([\s\S]*?)<\/published>/i)?.[1];
    const description =
      item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)?.[1] ||
      item.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] ||
      item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/i)?.[1] ||
      "";
    return {
      title: decodeXml(stripTags(title)).trim(),
      link: decodeXml(link).trim(),
      pubDate: pubDate?.trim(),
      description: stripTags(description),
    };
  });
}

export function stripTags(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

export function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export async function fetchRssXml(url: string, timeoutMs = 4_000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
