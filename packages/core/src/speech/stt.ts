// Nutqni matnga aylantirish (STT). O'zbek tili uchun ElevenLabs Scribe ~16% WER (03-hujjat §3);
// oddiy Whisper o'zbekchada zaif. Interfeys orqali provayderni almashtirish mumkin (Aisha, fine-tune Whisper).

export interface Transcript {
  text: string;
  /** Aniqlangan til (ISO-639), masalan "uzb" yoki "rus". */
  language?: string;
}

export interface SpeechToText {
  readonly id: string;
  transcribe(audio: Uint8Array, opts: { filename: string; mimeType: string; languageHint?: string }): Promise<Transcript>;
  /** Havola bo'yicha (masalan, YouTube video) — provayder qo'llab-quvvatlasa. */
  transcribeUrl?(url: string, opts?: { languageHint?: string }): Promise<Transcript>;
}

export class SttError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SttError";
  }
}

type FetchFn = typeof fetch;

/** ElevenLabs Speech-to-Text: POST /v1/speech-to-text (multipart). */
export class ElevenLabsStt implements SpeechToText {
  readonly id = "elevenlabs";

  constructor(
    private readonly apiKey: string,
    private readonly model = "scribe_v2",
    private readonly fetchFn: FetchFn = fetch,
    private readonly baseUrl = "https://api.elevenlabs.io",
  ) {}

  async transcribe(audio: Uint8Array, opts: { filename: string; mimeType: string; languageHint?: string }): Promise<Transcript> {
    const form = this.form(opts.languageHint);
    form.set("file", new Blob([new Uint8Array(audio)], { type: opts.mimeType }), opts.filename);
    return this.send(form);
  }

  async transcribeUrl(url: string, opts: { languageHint?: string } = {}): Promise<Transcript> {
    const form = this.form(opts.languageHint);
    form.set("source_url", url);
    return this.send(form);
  }

  private form(languageHint?: string): FormData {
    const form = new FormData();
    form.set("model_id", this.model);
    // Ovozli xabarda (kulgi) kabi teglar kerak emas — ular klonga savol sifatida boradi.
    form.set("tag_audio_events", "false");
    form.set("timestamps_granularity", "none");
    if (languageHint) form.set("language_code", languageHint);
    return form;
  }

  private async send(form: FormData): Promise<Transcript> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/speech-to-text`, { method: "POST", headers: { "xi-api-key": this.apiKey }, body: form, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new SttError(`STT xatosi: ${res.status} ${(await res.text()).slice(0, 300)}`, res.status);
    const data = (await res.json()) as { text?: string; language_code?: string };
    return { text: (data.text ?? "").trim(), ...(data.language_code ? { language: data.language_code } : {}) };
  }
}

/** Testlar va kalitsiz ishlab chiqish uchun: oldindan berilgan matnni qaytaradi. */
export class MockStt implements SpeechToText {
  readonly id = "mock";
  calls: { bytes: number; filename?: string; url?: string }[] = [];
  constructor(private readonly text = "Kurs narxi qancha?") {}

  async transcribe(audio: Uint8Array, opts: { filename: string }): Promise<Transcript> {
    this.calls.push({ bytes: audio.byteLength, filename: opts.filename });
    return { text: this.text, language: "uzb" };
  }

  async transcribeUrl(url: string): Promise<Transcript> {
    this.calls.push({ bytes: 0, url });
    return { text: this.text, language: "uzb" };
  }
}
