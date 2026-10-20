// Video-avatar: egasining surati + uning klonlangan ovozidagi audio → gapiruvchi video (lab-sinxron).
// Provayder interfeysi orqali: D-ID (Talks API) yoki keyinchalik mahalliy provayder.

export interface ImageClip {
  data: Uint8Array;
  mimeType: "image/jpeg" | "image/png";
}

export interface AudioForVideo {
  data: Uint8Array;
  mimeType: string;
}

export type TalkStatus = "created" | "started" | "done" | "error" | "rejected";

export interface TalkingAvatar {
  readonly id: string;
  /** Surat — biometrik ma'lumot: "foreign" bo'lsa UZ tenantlari uchun aniq ruxsat kerak. */
  readonly dataResidency: "uz" | "foreign";
  /** Video yaratishni boshlaydi; natija uchun getTalk() bilan kuzatiladi. */
  createTalk(image: ImageClip, audio: AudioForVideo): Promise<{ talkId: string }>;
  getTalk(talkId: string): Promise<{ status: TalkStatus; resultUrl?: string; durationSec?: number; error?: string }>;
  /** Tayyor videoni yuklab olgandan keyin provayderdagi nusxani o'chirish. */
  deleteTalk(talkId: string): Promise<void>;
  download(url: string): Promise<Uint8Array>;
}

export class AvatarProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Qayta urinish foyda bermaydi (moderatsiya, mashhur shaxs, noto'g'ri fayl). */
    readonly permanent = false,
  ) {
    super(message);
    this.name = "AvatarProviderError";
  }
}

type FetchFn = typeof fetch;

/** D-ID audio yuklash chegarasi. */
export const MAX_AVATAR_AUDIO_BYTES = 6 * 1024 * 1024;

/**
 * D-ID Talks API: rasm va audio vaqtinchalik xotiraga yuklanadi (POST /images, /audios), keyin
 * POST /talks { source_url, script: { type: "audio", audio_url } }. Natija havolasi 24 soat amal qiladi,
 * shuning uchun video yuklab olinadi va D-ID'dagi talk o'chiriladi.
 */
export class DIdAvatar implements TalkingAvatar {
  readonly id = "d-id";
  readonly dataResidency = "foreign" as const;
  private readonly base: string;

  constructor(
    private readonly apiKey: string,
    private readonly opts: { fetchFn?: FetchFn; baseUrl?: string } = {},
  ) {
    this.base = (opts.baseUrl ?? "https://api.d-id.com").replace(/\/$/, "");
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const res = await (this.opts.fetchFn ?? fetch)(`${this.base}${path}`, {
      ...init,
      headers: { authorization: `Basic ${this.apiKey}`, accept: "application/json", ...(init.headers as Record<string, string>) },
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 204) return undefined as T;
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const kind = String(body.kind ?? "");
      const msg = String(body.description ?? body.message ?? kind ?? res.status);
      if (res.status === 451)
        throw new AvatarProviderError(
          kind === "CelebrityRecognizedError" ? "Suratda mashhur shaxs aniqlandi — faqat o'zingizning suratingizni yuklang" : `Moderatsiyadan o'tmadi: ${msg}`,
          451,
          true,
        );
      throw new AvatarProviderError(`D-ID: ${msg}`, res.status, res.status === 400 || res.status === 401 || res.status === 402);
    }
    return body as T;
  }

  private async upload(path: "/images" | "/audios", field: "image" | "audio", data: Uint8Array, mimeType: string, filename: string): Promise<string> {
    const form = new FormData();
    form.append(field, new Blob([new Uint8Array(data)], { type: mimeType }), filename);
    const out = await this.request<{ url: string }>(path, { method: "POST", body: form });
    return out.url;
  }

  async createTalk(image: ImageClip, audio: AudioForVideo): Promise<{ talkId: string }> {
    if (audio.data.byteLength > MAX_AVATAR_AUDIO_BYTES) throw new AvatarProviderError("Audio 6 MB dan katta", 413, true);
    const sourceUrl = await this.upload("/images", "image", image.data, image.mimeType, image.mimeType === "image/png" ? "avatar.png" : "avatar.jpg");
    const audioUrl = await this.upload("/audios", "audio", audio.data, audio.mimeType, "javob.mp3");
    const out = await this.request<{ id: string }>("/talks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source_url: sourceUrl, script: { type: "audio", audio_url: audioUrl }, config: { stitch: true } }),
    });
    return { talkId: out.id };
  }

  async getTalk(talkId: string) {
    const t = await this.request<{ status: TalkStatus; result_url?: string; duration?: number; error?: { description?: string; kind?: string } }>(`/talks/${encodeURIComponent(talkId)}`, { method: "GET" });
    return {
      status: t.status,
      ...(t.result_url ? { resultUrl: t.result_url } : {}),
      ...(typeof t.duration === "number" ? { durationSec: t.duration } : {}),
      ...(t.error ? { error: t.error.description ?? t.error.kind ?? "xato" } : {}),
    };
  }

  async deleteTalk(talkId: string): Promise<void> {
    await this.request(`/talks/${encodeURIComponent(talkId)}`, { method: "DELETE" });
  }

  async download(url: string): Promise<Uint8Array> {
    const res = await (this.opts.fetchFn ?? fetch)(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new AvatarProviderError(`Videoni yuklab bo'lmadi (${res.status})`, res.status);
    return new Uint8Array(await res.arrayBuffer());
  }
}
