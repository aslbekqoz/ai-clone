import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 3_000_000;

/**
 * Sahifani yuklab, HTML'dan o'qiladigan matnni ajratadi. MVP uchun oddiy; v1 da Firecrawl/Jina
 * Reader bilan almashtiriladi (JS bilan chiziladigan sahifalar uchun).
 */
export async function fetchUrlText(url: string): Promise<{ title: string; text: string }> {
  const u = new URL(url);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Faqat http(s) havolalar");
  await assertPublicHost(u.hostname);

  const res = await fetch(u, { redirect: "error", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "AIClone-Ingest/0.1" } });
  if (!res.ok) throw new Error(`Sahifa yuklanmadi: ${res.status}`);
  const html = (await res.text()).slice(0, MAX_BYTES);
  return htmlToText(html, u.hostname);
}

export function htmlToText(html: string, fallbackTitle = "Sahifa"): { title: string; text: string } {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? fallbackTitle);
  const text = decode(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|h[1-6]|li|tr|section|article|br)>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*(\n\s*)+/g, "\n\n")
    .trim();
  return { title, text };
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

/** SSRF himoyasi: ichki tarmoq manzillariga so'rov yuborilmaydi. */
async function assertPublicHost(hostname: string): Promise<void> {
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
  for (const { address } of addresses) {
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address) || address === "::1" || /^f[cd]|^fe80/i.test(address)) {
      throw new Error("Ichki tarmoq manzillariga ruxsat yo'q");
    }
  }
}
