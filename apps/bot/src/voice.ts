import type { SpeechToText } from "@ai-clone/core";

/** Ovozli xabarning maksimal uzunligi: uzunroq audio — savol emas, STT xarajatini ham cheklaydi. */
export const MAX_VOICE_SECONDS = 180;

type FetchFn = typeof fetch;

/**
 * Telegram faylini yuklab, matnga aylantiradi. `filePath` — getFile() natijasi.
 * Fayl Bot API orqali olinadi: https://api.telegram.org/file/bot<token>/<file_path>.
 */
export async function transcribeTelegramFile(
  stt: SpeechToText,
  token: string,
  file: { filePath: string; mimeType?: string; durationSec: number },
  fetchFn: FetchFn = fetch,
): Promise<{ ok: true; text: string } | { ok: false; reason: "too_long" | "empty" | "download_failed" }> {
  if (file.durationSec > MAX_VOICE_SECONDS) return { ok: false, reason: "too_long" };
  const res = await fetchFn(`https://api.telegram.org/file/bot${token}/${file.filePath}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return { ok: false, reason: "download_failed" };
  const audio = new Uint8Array(await res.arrayBuffer());
  const filename = file.filePath.split("/").at(-1) ?? "voice.ogg";
  const { text } = await stt.transcribe(audio, { filename, mimeType: file.mimeType ?? "audio/ogg" });
  return text ? { ok: true, text } : { ok: false, reason: "empty" };
}

export const VOICE_REPLIES = {
  too_long: `🎙 Ovozli xabar juda uzun (${MAX_VOICE_SECONDS / 60} daqiqagacha yuboring) — yoki savolingizni yozib yuboring.`,
  empty: "🎙 Ovozli xabarda nutqni aniqlay olmadim. Iltimos, qaytadan yoki yozib yuboring.",
  download_failed: "🎙 Ovozli xabarni yuklab bo'lmadi. Iltimos, qaytadan urinib ko'ring.",
  disabled: "🎙 Hozircha ovozli xabarlarni tushunmayman — savolingizni yozib yuboring, iltimos.",
} as const;
