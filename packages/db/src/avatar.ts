import { AvatarProviderError, type ImageClip, type TalkingAvatar } from "@ai-clone/core";
import type { Db } from "./pool.js";
import type { VoiceService } from "./voice.js";

export type AvatarMode = "off" | "always";
export type AvatarChannel = "web" | "telegram";

/** Oyiga video daqiqalari (05-hujjat: video — eng qimmat kanal, faqat Business+). */
export const AVATAR_SECONDS: Record<string, number> = { free: 0, creator: 0, pro: 0, business: 20 * 60, enterprise: 100 * 60 };
/** Bitta video javob ~20 soniya: uzunroq javoblar faqat matnda (va ovozda) boradi. */
export const MAX_AVATAR_CHARS = 300;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const CHARS_PER_SECOND = 15;

export class AvatarError extends Error {
  constructor(
    message: string,
    readonly status: 402 | 403 | 404 | 409 | 413 | 415 | 422 | 503 = 422,
  ) {
    super(message);
    this.name = "AvatarError";
  }
}

export function avatarConsentText(name: string): string {
  return (
    `Men, ${name}, ushbu suratdagi shaxs ekanimni tasdiqlayman. AI Clone platformasiga suratim va klonlangan ovozim ` +
    `asosida mening AI-klonim nomidan video javoblar yaratishga roziman. Har bir video AI tomonidan yaratilgani ` +
    `ko'rsatiladi. Bu rozilikni istalgan vaqtda qaytarib olishim mumkin — shunda suratim va videolar o'chiriladi.`
  );
}

/** Fayl turi sarlavha baytlari bo'yicha (kengaytma yoki mime ishonchli emas). */
export function sniffImage(data: Uint8Array): ImageClip["mimeType"] | null {
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "image/png";
  return null;
}

/** Videoda o'qiladigan matn: iqtibos belgilari, havolalar va "Manba" bloki olib tashlanadi. */
export function speakableText(reply: string): string {
  return reply
    .split(/\n+📚|\nManba:/)[0]!
    .replace(/\s*\[S\d+(?:,\s*S\d+)*\]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Video-avatar: rozilik (surat + to'liq ism bilan imzo) → har bir javob uchun video navbatda tayyorlanadi.
 * Ovoz kloni shart: video egasining o'z ovozida gapiradi (ovoz rozilik bilan alohida tasdiqlangan).
 */
export class AvatarService {
  constructor(
    private readonly db: Db,
    private readonly provider: TalkingAvatar | null,
    private readonly voice: VoiceService,
    private readonly opts: { allowCrossBorder?: boolean; now?: () => Date } = {},
  ) {}

  private now(): Date {
    return this.opts.now?.() ?? new Date();
  }

  async status(tenantId: string, cloneId: string) {
    const { rows } = await this.db.query<{ display_name: string; avatar_mode: AvatarMode; enrolled_at: Date | null; plan: string; plan_expires_at: Date | null; used: string }>(
      `SELECT c.display_name, c.avatar_mode, p.created_at AS enrolled_at, t.plan, t.plan_expires_at,
              coalesce((SELECT sum(r.seconds) FROM avatar_renders r WHERE r.tenant_id = t.id AND r.status = 'done' AND r.created_at >= date_trunc('month', now())), 0) AS used
         FROM clones c JOIN tenants t ON t.id = c.tenant_id LEFT JOIN avatar_profiles p ON p.clone_id = c.id
        WHERE c.id = $1 AND c.tenant_id = $2`,
      [cloneId, tenantId],
    );
    const r = rows[0];
    if (!r) throw new AvatarError("Klon topilmadi", 404);
    const plan = r.plan_expires_at && r.plan_expires_at.getTime() < this.now().getTime() ? "free" : r.plan;
    return {
      available: Boolean(this.provider),
      enrolled: r.enrolled_at !== null,
      enrolledAt: r.enrolled_at,
      mode: r.avatar_mode,
      secondsIncluded: AVATAR_SECONDS[plan] ?? 0,
      secondsUsed: Math.round(Number(r.used)),
      consentText: avatarConsentText(r.display_name),
    };
  }

  async enroll(tenantId: string, cloneId: string, input: { photo: Uint8Array; signature: string; ip?: string }): Promise<void> {
    if (!this.provider) throw new AvatarError("Video-avatar provayderi sozlanmagan (DID_API_KEY)", 503);
    const region = (await this.db.query<{ region: string }>("SELECT region FROM tenants WHERE id = $1", [tenantId])).rows[0]?.region;
    if (region === "uz" && this.provider.dataResidency === "foreign" && !this.opts.allowCrossBorder) {
      throw new AvatarError(
        "O'zbekiston qonunchiligiga ko'ra surat (biometrik ma'lumot) faqat O'zbekistondagi serverlarda qayta ishlanadi. Mahalliy provayder ulanmaguncha yoki yurist xulosasi bilan AVATAR_ALLOW_CROSS_BORDER=1 yoqilmaguncha video-avatar o'chiq.",
        403,
      );
    }
    const s = await this.status(tenantId, cloneId);
    if (!s.secondsIncluded) throw new AvatarError("Video-avatar Business tarifida mavjud", 402);
    if (!(await this.voice.status(tenantId, cloneId)).enrolled) throw new AvatarError("Avval ovoz klonini yarating — video sizning ovozingizda gapiradi", 409);
    if (input.photo.byteLength > MAX_PHOTO_BYTES) throw new AvatarError("Surat 8 MB dan katta", 413);
    const mime = sniffImage(input.photo);
    if (!mime) throw new AvatarError("Surat JPG yoki PNG bo'lsin", 415);
    const name = (await this.db.query<{ display_name: string }>("SELECT display_name FROM clones WHERE id = $1", [cloneId])).rows[0]!.display_name;
    if (input.signature.trim().toLocaleLowerCase() !== name.trim().toLocaleLowerCase()) throw new AvatarError(`Rozilikni tasdiqlash uchun ismingizni aynan "${name}" deb yozing`);

    await this.db.query(
      `INSERT INTO avatar_profiles (tenant_id, clone_id, photo, photo_mime, consent_text, consent_signature, consent_ip, provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (clone_id) DO UPDATE SET photo = EXCLUDED.photo, photo_mime = EXCLUDED.photo_mime, consent_text = EXCLUDED.consent_text,
         consent_signature = EXCLUDED.consent_signature, consent_ip = EXCLUDED.consent_ip, provider = EXCLUDED.provider, created_at = now()`,
      [tenantId, cloneId, Buffer.from(input.photo), mime, avatarConsentText(name), input.signature.trim(), input.ip ?? null, this.provider.id],
    );
    await this.db.query("INSERT INTO audit_log (tenant_id, actor, action, target) VALUES ($1, 'owner', 'avatar.enroll', $2)", [tenantId, cloneId]);
  }

  async setMode(tenantId: string, cloneId: string, mode: AvatarMode): Promise<void> {
    if (mode !== "off" && !(await this.status(tenantId, cloneId)).enrolled) throw new AvatarError("Avval suratni yuklang va rozilikni tasdiqlang", 409);
    await this.db.query("UPDATE clones SET avatar_mode = $3 WHERE id = $1 AND tenant_id = $2", [cloneId, tenantId, mode]);
  }

  /** Rozilikni qaytarib olish: surat, rozilik va barcha videolar o'chiriladi. */
  async revoke(tenantId: string, cloneId: string): Promise<boolean> {
    const r = await this.db.query("DELETE FROM avatar_profiles WHERE clone_id = $1 AND tenant_id = $2", [cloneId, tenantId]);
    if (!r.rowCount) return false;
    await this.db.query("UPDATE avatar_renders SET video = NULL, text = '' WHERE clone_id = $1", [cloneId]);
    await this.db.query("UPDATE clones SET avatar_mode = 'off' WHERE id = $1", [cloneId]);
    await this.db.query("INSERT INTO audit_log (tenant_id, actor, action, target) VALUES ($1, 'owner', 'avatar.revoke', $2)", [tenantId, cloneId]);
    return true;
  }

  /**
   * Javobga video kerakmi: rejim, rozilik, uzunlik va oylik kvota. Kerak bo'lsa — navbat uchun yozuv
   * yaratadi va ID qaytaradi (video worker'da tayyorlanadi), aks holda null.
   */
  async request(tenantId: string, cloneId: string, input: { conversationId: string; reply: string; channel: AvatarChannel; recipient: string }): Promise<string | null> {
    if (!this.provider) return null;
    const s = await this.status(tenantId, cloneId);
    if (!s.enrolled || s.mode === "off") return null;
    let text = speakableText(input.reply);
    if (!text) return null;
    const { rows: prev } = await this.db.query("SELECT 1 FROM avatar_renders WHERE conversation_id = $1 AND status <> 'failed' LIMIT 1", [input.conversationId]);
    // Suhbatdagi birinchi video AI ekanini o'zi aytadi (oshkoralik, 04-hujjat §3.3).
    if (!prev.length) {
      const name = (await this.db.query<{ display_name: string }>("SELECT display_name FROM clones WHERE id = $1", [cloneId])).rows[0]!.display_name;
      text = `Men ${name}ning AI-kloniman. ${text}`;
    }
    // Ovoz (VoiceService.preview) ham shu chegarada kesiladi — oshkoralik bilan birga hisoblanadi.
    if (text.length > MAX_AVATAR_CHARS) return null;
    if (s.secondsUsed + text.length / CHARS_PER_SECOND > s.secondsIncluded) return null;
    const { rows } = await this.db.query<{ id: string }>(
      "INSERT INTO avatar_renders (tenant_id, clone_id, conversation_id, channel, recipient, text) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [tenantId, cloneId, input.conversationId, input.channel, input.recipient, text],
    );
    return rows[0]!.id;
  }

  /** Worker: ovoz → provayder → tayyor video bazaga. Provayderdagi nusxa yuklab olingach o'chiriladi. */
  async render(renderId: string, opts: { pollMs?: number; maxWaitMs?: number } = {}): Promise<{ channel: AvatarChannel; recipient: string; tenantId: string; cloneId: string; video: Uint8Array }> {
    if (!this.provider) throw new AvatarProviderError("Provayder sozlanmagan", 503, true);
    const { rows } = await this.db.query<{ tenant_id: string; clone_id: string; channel: AvatarChannel; recipient: string; text: string; status: string; photo: Buffer | null; photo_mime: ImageClip["mimeType"] | null }>(
      `SELECT r.tenant_id, r.clone_id, r.channel, r.recipient, r.text, r.status, p.photo, p.photo_mime
         FROM avatar_renders r LEFT JOIN avatar_profiles p ON p.clone_id = r.clone_id WHERE r.id = $1`,
      [renderId],
    );
    const r = rows[0];
    if (!r) throw new AvatarProviderError("Video yozuvi topilmadi", 404, true);
    if (!r.photo || !r.photo_mime) throw new AvatarProviderError("Rozilik qaytarib olingan", 409, true);
    await this.db.query("UPDATE avatar_renders SET status = 'rendering' WHERE id = $1", [renderId]);

    const audio = await this.voice.preview(r.tenant_id, r.clone_id, r.text).catch((err: Error) => {
      throw new AvatarProviderError(`Ovoz tayyorlanmadi: ${err.message}`, 409, true);
    });
    const { talkId } = await this.provider.createTalk({ data: new Uint8Array(r.photo), mimeType: r.photo_mime }, { data: audio.audio, mimeType: audio.mimeType });
    await this.db.query("UPDATE avatar_renders SET talk_id = $2 WHERE id = $1", [renderId, talkId]);

    const pollMs = opts.pollMs ?? 3000;
    const deadline = Date.now() + (opts.maxWaitMs ?? 180_000);
    let talk = await this.provider.getTalk(talkId);
    while (talk.status === "created" || talk.status === "started") {
      if (Date.now() > deadline) throw new AvatarProviderError("Video vaqtida tayyor bo'lmadi");
      await new Promise((res) => setTimeout(res, pollMs));
      talk = await this.provider.getTalk(talkId);
    }
    if (talk.status !== "done" || !talk.resultUrl) throw new AvatarProviderError(`Video yaratilmadi: ${talk.error ?? talk.status}`, 422, talk.status === "rejected");
    const video = await this.provider.download(talk.resultUrl);
    await this.provider.deleteTalk(talkId).catch((err: Error) => console.error("D-ID talk o'chirilmadi:", err.message));
    await this.db.query("UPDATE avatar_renders SET status = 'done', video = $2, seconds = $3, finished_at = now() WHERE id = $1", [
      renderId,
      Buffer.from(video),
      talk.durationSec ?? r.text.length / CHARS_PER_SECOND,
    ]);
    return { channel: r.channel, recipient: r.recipient, tenantId: r.tenant_id, cloneId: r.clone_id, video };
  }

  async markFailed(renderId: string, error: string): Promise<void> {
    await this.db.query("UPDATE avatar_renders SET status = 'failed', error = $2, finished_at = now() WHERE id = $1", [renderId, error.slice(0, 500)]);
  }

  /** Vidjet: faqat shu tashrifchining videosi. */
  async forVisitor(cloneId: string, renderId: string, visitorId: string): Promise<{ status: string; video: Uint8Array | null } | null> {
    if (!/^[0-9a-f-]{36}$/i.test(renderId)) return null;
    const { rows } = await this.db.query<{ status: string; video: Buffer | null }>(
      "SELECT status, video FROM avatar_renders WHERE id = $1 AND clone_id = $2 AND channel = 'web' AND recipient = $3",
      [renderId, cloneId, visitorId],
    );
    const r = rows[0];
    return r ? { status: r.status, video: r.video ? new Uint8Array(r.video) : null } : null;
  }

  /** Videolar 30 kundan keyin o'chiriladi (hisob uchun soniyalar qoladi). */
  async cleanup(days = 30): Promise<number> {
    const r = await this.db.query("UPDATE avatar_renders SET video = NULL, text = '' WHERE video IS NOT NULL AND created_at < now() - make_interval(days => $1)", [days]);
    return r.rowCount ?? 0;
  }
}
