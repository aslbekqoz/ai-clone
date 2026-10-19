// Ovoz klonlash va matnni egasining ovozida o'qish (TTS). Ovoz — biometrik ma'lumot
// (09-hujjat, ZRU-547 2026-yil mart o'zgartirishi): provayder qayerda qayta ishlashini bildiradi,
// servis esa tenant regioni bo'yicha ruxsat beradi yoki rad etadi.

export interface AudioClip {
  data: Uint8Array;
  filename: string;
  mimeType: string;
}

export interface VoiceCloner {
  readonly id: string;
  /** "uz" — O'zbekistondagi serverda qayta ishlaydi; "foreign" — chegaradan tashqarida. */
  readonly dataResidency: "uz" | "foreign";
  createVoice(name: string, samples: AudioClip[]): Promise<{ voiceId: string }>;
  deleteVoice(voiceId: string): Promise<void>;
  synthesize(voiceId: string, text: string, opts?: { languageHint?: string }): Promise<{ audio: Uint8Array; mimeType: string }>;
}

export class VoiceProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "VoiceProviderError";
  }
}

type FetchFn = typeof fetch;

/** ElevenLabs Instant Voice Clone + Text-to-Speech. `eleven_v3` o'zbek tilini qo'llab-quvvatlaydi. */
export class ElevenLabsVoice implements VoiceCloner {
  readonly id = "elevenlabs";
  readonly dataResidency = "foreign" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model = "eleven_v3",
    private readonly fetchFn: FetchFn = fetch,
    private readonly baseUrl = "https://api.elevenlabs.io",
  ) {}

  private async req(path: string, init: RequestInit): Promise<Response> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, { ...init, headers: { "xi-api-key": this.apiKey, ...(init.headers as Record<string, string>) }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new VoiceProviderError(`ElevenLabs xatosi: ${res.status} ${(await res.text()).slice(0, 300)}`, res.status);
    return res;
  }

  async createVoice(name: string, samples: AudioClip[]): Promise<{ voiceId: string }> {
    const form = new FormData();
    form.set("name", name);
    form.set("remove_background_noise", "true");
    form.set("description", "AI Clone: egasining roziligi bilan yaratilgan ovoz");
    for (const s of samples) form.append("files", new Blob([new Uint8Array(s.data)], { type: s.mimeType }), s.filename);
    const data = (await (await this.req("/v1/voices/add", { method: "POST", body: form })).json()) as { voice_id?: string };
    if (!data.voice_id) throw new VoiceProviderError("ElevenLabs voice_id qaytarmadi");
    return { voiceId: data.voice_id };
  }

  async deleteVoice(voiceId: string): Promise<void> {
    await this.req(`/v1/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE" });
  }

  async synthesize(voiceId: string, text: string, opts: { languageHint?: string } = {}): Promise<{ audio: Uint8Array; mimeType: string }> {
    const res = await this.req(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: this.model, ...(opts.languageHint ? { language_code: opts.languageHint } : {}) }),
    });
    // Telegram sendVoice MP3 ni qabul qiladi.
    return { audio: new Uint8Array(await res.arrayBuffer()), mimeType: "audio/mpeg" };
  }
}

/** Testlar uchun: ovozni "yaratadi" va matn uzunligiga teng soxta audio qaytaradi. */
export class MockVoice implements VoiceCloner {
  readonly id = "mock";
  created: { name: string; samples: number }[] = [];
  deleted: string[] = [];
  spoken: string[] = [];
  constructor(readonly dataResidency: "uz" | "foreign" = "uz") {}

  async createVoice(name: string, samples: AudioClip[]): Promise<{ voiceId: string }> {
    this.created.push({ name, samples: samples.length });
    return { voiceId: `voice-${this.created.length}` };
  }
  async deleteVoice(voiceId: string): Promise<void> {
    this.deleted.push(voiceId);
  }
  async synthesize(_voiceId: string, text: string): Promise<{ audio: Uint8Array; mimeType: string }> {
    this.spoken.push(text);
    return { audio: new TextEncoder().encode(text), mimeType: "audio/mpeg" };
  }
}

// --- Rozilik matni (09-hujjat: jonli rozilik iborasi) ---

/** Egasi kamera/mikrofon oldida o'qiydigan, har safar yangi kodli rozilik matni. */
export function consentScript(name: string, date: Date, code: string): string {
  const d = date.toISOString().slice(0, 10);
  return `Men, ${name}, ${d} kuni AI Clone xizmatiga o'z ovozimdan AI-klon yaratishga roziman. Bu ovoz faqat mening klonim javoblari uchun ishlatiladi va men istalgan vaqtda roziligimni qaytarib olishim mumkin. Tasdiqlash kodi: ${code.split("").join(" ")}.`;
}

/**
 * 4 xonali kod. Matnda sana ham o'qiladi, shuning uchun kod sana raqamlari ichida uchramasligi
 * kerak — aks holda kod aytilmasa ham tekshiruv o'tib ketardi.
 */
export function randomConsentCode(date: Date, random: () => number = Math.random): string {
  const dateDigits = date.toISOString().slice(0, 10).replace(/\D/g, "");
  for (;;) {
    const code = String(Math.floor(1000 + random() * 9000));
    if (!dateDigits.includes(code)) return code;
  }
}

const NUMBER_WORDS: Record<string, string> = { nol: "0", bir: "1", ikki: "2", uch: "3", "to'rt": "4", tort: "4", besh: "5", olti: "6", yetti: "7", sakkiz: "8", "to'qqiz": "9", toqqiz: "9" };

/**
 * STT transkripti rozilik matniga mosligini tekshiradi: tasdiqlash kodi (raqam yoki so'z bilan
 * aytilgan) va "roziman" so'zi bo'lishi shart. Yozib olingan eski audio yangi kod bilan mos kelmaydi.
 */
export function verifyConsentTranscript(transcript: string, code: string): { ok: boolean; reason?: "code_missing" | "consent_word_missing" } {
  const text = transcript.toLowerCase().replace(/[ʻʼ‘’`]/g, "'");
  const words = text.match(/[\p{L}']+|\d/gu) ?? [];
  const digits = words.map((w) => (/^\d$/.test(w) ? w : NUMBER_WORDS[w] ?? "")).join("");
  const spokenDigits = text.replace(/\D/g, "");
  if (!digits.includes(code) && !spokenDigits.includes(code)) return { ok: false, reason: "code_missing" };
  if (!/(roziman|rozimen|согласен|согласна|i agree|i consent)/.test(text)) return { ok: false, reason: "consent_word_missing" };
  return { ok: true };
}
