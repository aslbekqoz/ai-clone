import type { SpeechToText } from "../speech/stt.js";
import type { Section } from "./files.js";

type FetchFn = typeof fetch;

export interface YouTubeTranscript {
  videoId: string;
  title: string;
  /** "captions" — YouTube subtitrlari; "stt" — subtitr yo'q, audio matnga aylantirildi. */
  method: "captions" | "stt";
  language?: string;
  sections: Section[];
}

/** youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /embed/ID, /live/ID ko'rinishlaridan video ID'sini oladi. */
export function parseYouTubeId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return /^[\w-]{11}$/.test(input) ? input : null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)?.[1] ?? null;
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
}

const LANG_PREFERENCE = ["uz", "ru", "en"];

/** Watch sahifasidagi player javobidan subtitr treklari va sarlavhani ajratadi. */
export function extractCaptionTracks(html: string): { title: string; tracks: CaptionTrack[] } {
  const title = decodeEntities(html.match(/<meta name="title" content="([^"]*)"/)?.[1] ?? html.match(/<title>([^<]*)<\/title>/)?.[1]?.replace(/ - YouTube$/, "") ?? "YouTube video");
  const json = sliceJsonArray(html, '"captionTracks":');
  if (!json) return { title, tracks: [] };
  try {
    const tracks = JSON.parse(json) as CaptionTrack[];
    return { title, tracks: tracks.filter((t) => typeof t.baseUrl === "string" && t.baseUrl.startsWith("https://")) };
  } catch {
    return { title, tracks: [] };
  }
}

/** Afzal til: o'zbek → rus → ingliz; qo'lda yozilgan subtitr avtomatikdan (kind: "asr") ustun. */
export function pickTrack(tracks: CaptionTrack[]): CaptionTrack | undefined {
  const score = (t: CaptionTrack) => {
    const li = LANG_PREFERENCE.indexOf(t.languageCode.split("-")[0]!);
    return (li === -1 ? 10 : li) * 2 + (t.kind === "asr" ? 1 : 0);
  };
  return [...tracks].sort((a, b) => score(a) - score(b))[0];
}

interface Json3 {
  events?: { tStartMs?: number; segs?: { utf8?: string }[] }[];
}

/**
 * json3 subtitrlarini ~90 soniyalik oynalarga yig'adi (04-hujjat §3.1): har bir oyna —
 * alohida bo'lim, iqtibos havolasi videoning shu daqiqasiga olib boradi.
 */
export function captionsToSections(json: Json3, videoId: string, windowSec = 90): Section[] {
  const sections: Section[] = [];
  let start = -1;
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    if (text) sections.push({ text, locator: { ts: start, url: `https://youtu.be/${videoId}?t=${start}` } });
    buf = [];
  };
  for (const ev of json.events ?? []) {
    const text = (ev.segs ?? []).map((s) => s.utf8 ?? "").join("").trim();
    if (!text) continue;
    const t = Math.floor((ev.tStartMs ?? 0) / 1000);
    if (start < 0) start = t;
    if (t - start >= windowSec) {
      flush();
      start = t;
    }
    buf.push(text);
  }
  flush();
  return sections;
}

/**
 * YouTube video transkripti: avval subtitrlar, bo'lmasa (yoki YouTube serverdan bloklasa) — STT
 * (ElevenLabs `source_url` YouTube havolalarini qabul qiladi).
 */
export async function fetchYouTubeTranscript(input: string, opts: { stt?: SpeechToText | null; fetchFn?: FetchFn } = {}): Promise<YouTubeTranscript> {
  const videoId = parseYouTubeId(input);
  if (!videoId) throw new Error("YouTube havolasi noto'g'ri");
  const fetchFn = opts.fetchFn ?? fetch;
  let title = "YouTube video";

  try {
    const page = await fetchFn(`https://www.youtube.com/watch?v=${videoId}&hl=uz`, { headers: { "accept-language": "uz,ru;q=0.8,en;q=0.6", "user-agent": "Mozilla/5.0 AIClone-Ingest" }, signal: AbortSignal.timeout(15_000) });
    if (page.ok) {
      const parsed = extractCaptionTracks(await page.text());
      title = parsed.title;
      const track = pickTrack(parsed.tracks);
      if (track) {
        const res = await fetchFn(`${track.baseUrl}&fmt=json3`, { signal: AbortSignal.timeout(15_000) });
        if (res.ok) {
          const sections = captionsToSections((await res.json()) as Json3, videoId);
          if (sections.length) return { videoId, title, method: "captions", language: track.languageCode, sections };
        }
      }
    }
  } catch {
    // Tarmoq yoki YouTube bloklashi — STT'ga o'tiladi.
  }

  if (!opts.stt?.transcribeUrl) throw new Error("Videoda subtitr topilmadi. Subtitrsiz videolar uchun STT (ELEVENLABS_API_KEY) kerak.");
  const t = await opts.stt.transcribeUrl(`https://www.youtube.com/watch?v=${videoId}`);
  if (!t.text) throw new Error("Videodan nutq aniqlanmadi");
  return { videoId, title, method: "stt", ...(t.language ? { language: t.language } : {}), sections: [{ text: t.text, locator: { url: `https://youtu.be/${videoId}` } }] };
}

/** `marker` dan keyin keladigan JSON massivini qavslar muvozanati bo'yicha kesib oladi (satrlar ichidagi qavslar hisobga olinmaydi). */
function sliceJsonArray(text: string, marker: string): string | null {
  const start = text.indexOf(marker);
  if (start < 0) return null;
  const open = text.indexOf("[", start + marker.length);
  if (open < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return null;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
