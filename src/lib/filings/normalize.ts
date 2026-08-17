/**
 * HTML → plain text normalization for filing compares.
 * Removes nav/noise; preserves paragraph boundaries; dampens table formatting noise.
 */

export function normalizeFilingHtml(html: string): string {
  if (!html?.trim()) return "";

  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // Drop common EDGAR chrome / TOC / nav blocks when tagged
  s = s.replace(
    /<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi,
    " "
  );

  // Tables → line-broken cells (avoid treating column shifts as prose)
  s = s.replace(/<\/tr>/gi, "\n");
  s = s.replace(/<\/(td|th)>/gi, " | ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/p>/gi, "\n\n");
  s = s.replace(/<\/div>/gi, "\n");
  s = s.replace(/<\/h[1-6]>/gi, "\n\n");
  s = s.replace(/<[^>]+>/g, " ");

  s = decodeEntities(s);

  // Normalize whitespace but keep paragraph breaks
  s = s.replace(/\r/g, "");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/\n[ \t]+/g, "\n");
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");

  // Soften table pipe runs into spaces for formatting-only compares later
  s = s.replace(/(?:\s*\|\s*){2,}/g, " ");

  return s.trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const c = Number(n);
      return Number.isFinite(c) ? String.fromCharCode(c) : "";
    });
}

/** Aggressive normalize for formatting-only detection */
export function normalizeForFormatCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/\|/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split into paragraphs; drop tiny noise lines */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 12);
}

export function paragraphKey(p: string): string {
  return normalizeForFormatCompare(p);
}
