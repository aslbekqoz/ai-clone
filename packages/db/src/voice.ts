import { consentScript, randomConsentCode, verifyConsentTranscript, type AudioClip, type SpeechToText, type VoiceCloner } from "@ai-clone/core";
import { withTenant, type Db } from "./pool.js";

export type VoiceMode = "off" | "voice_in" | "always";

/** Tarif bo'yicha oylik ovoz daqiqalari (05-hujjat: ovoz — alohida o'lchanadigan paket). */
export const VOICE_MINUTES: Record<string, number> = { free: 0, creator: 0, pro: 30, business: 120, enterprise: 600 };
/** O'rtacha nutq tezligi: ~15 belgi/soniya — matn uzunligidan daqiqa hisoblanadi. */
const CHARS_PER_SECOND = 15;
const CONSENT_TTL_MS = 30 * 60_000;
const MAX_CLIP_BYTES = 10 * 1024 * 1024;
const MAX_TTS_CHARS = 1500;

export class VoiceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 422 | 503 = 400,
  ) {
    super(message);
    this.name = "VoiceError";
  }
}

export interface VoiceServiceOptions {
  /** Xorijiy provayderga biometrik ma'lumot yuborishga ruxsat (faqat yurist xulosasidan keyin). */
  allowCrossBorder?: boolean;
  now?: () => Date;
}

/**
 * Ovoz kloni: rozilik → tekshiruv → ovoz yaratish → javoblarni ovozda o'qish → qaytarib olish.
 * Rozilik yozuvi STT bilan tekshiriladi: unda shu safar berilgan kod va "roziman" bo'lishi shart.
 */
export class VoiceService {
  constructor(
    private readonly db: Db,
    private readonly cloner: VoiceCloner | null,
    private readonly stt: SpeechToText | null,
    private readonly opts: VoiceServiceOptions = {},
  ) {}

  private now(): Date {
    return this.opts.now?.() ?? new Date();
  }

  /** Biometrik ma'lumot siyosati: UZ tenanti uchun xorijiy provayder faqat aniq ruxsat bilan. */
  private async assertResidency(tenantId: string): Promise<void> {
    if (!this.cloner) throw new VoiceError("Ovoz klonlash provayderi sozlanmagan", 503);
    if (!this.stt) throw new VoiceError("Rozilikni tekshirish uchun STT kerak (ELEVENLABS_API_KEY)", 503);
    const { rows } = await this.db.query<{ region: string }>("SELECT region FROM tenants WHERE id = $1", [tenantId]);
    if (rows[0]?.region === "uz" && this.cloner.dataResidency === "foreign" && !this.opts.allowCrossBorder) {
      throw new VoiceError(
        "O'zbekiston qonunchiligiga ko'ra ovoz (biometrik ma'lumot) faqat O'zbekistondagi serverlarda qayta ishlanadi. Mahalliy TTS provayderi ulanmaguncha yoki yurist xulosasi bilan VOICE_ALLOW_CROSS_BORDER=1 yoqilmaguncha ovoz klonlash o'chiq.",
        403,
      );
    }
  }

  async issueConsent(tenantId: string, cloneId: string): Promise<{ consentId: string; script: string; expiresAt: Date }> {
    await this.assertResidency(tenantId);
    const name = await withTenant(this.db, tenantId, async (tx) => (await tx.query<{ display_name: string }>("SELECT display_name FROM clones WHERE id = $1", [cloneId])).rows[0]?.display_name);
    if (!name) throw new VoiceError("Klon topilmadi", 404);
    const now = this.now();
    const code = randomConsentCode(now);
    const script = consentScript(name, now, code);
    const expiresAt = new Date(now.getTime() + CONSENT_TTL_MS);
    const { rows } = await this.db.query<{ id: string }>(
      "INSERT INTO voice_consents (tenant_id, clone_id, script, code, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [tenantId, cloneId, script, code, expiresAt],
    );
    return { consentId: rows[0]!.id, script, expiresAt };
  }

  async enroll(tenantId: string, cloneId: string, input: { consentId: string; consent: AudioClip; samples: AudioClip[]; ip?: string }): Promise<{ provider: string }> {
    await this.assertResidency(tenantId);
    if (!input.samples.length || input.samples.length > 5) throw new VoiceError("1–5 ta ovoz namunasi kerak (jami 1–3 daqiqa toza nutq)", 422);
    if ([input.consent, ...input.samples].some((c) => c.data.byteLength > MAX_CLIP_BYTES || c.data.byteLength === 0)) throw new VoiceError("Har bir audio 10 MB gacha bo'lishi kerak", 422);

    const { rows } = await this.db.query<{ code: string; status: string; expires_at: Date; display_name: string }>(
      "SELECT v.code, v.status, v.expires_at, c.display_name FROM voice_consents v JOIN clones c ON c.id = v.clone_id WHERE v.id = $1 AND v.tenant_id = $2 AND v.clone_id = $3",
      [input.consentId, tenantId, cloneId],
    );
    const consent = rows[0];
    if (!consent || consent.status !== "pending") throw new VoiceError("Rozilik so'rovi topilmadi — yangi matn oling", 404);
    if (consent.expires_at.getTime() < this.now().getTime()) {
      await this.db.query("UPDATE voice_consents SET status = 'expired' WHERE id = $1", [input.consentId]);
      throw new VoiceError("Rozilik matnining muddati o'tgan — yangisini oling", 409);
    }

    const transcript = (await this.stt!.transcribe(input.consent.data, { filename: input.consent.filename, mimeType: input.consent.mimeType })).text;
    const check = verifyConsentTranscript(transcript, consent.code);
    if (!check.ok) {
      throw new VoiceError(
        check.reason === "code_missing" ? "Yozuvda tasdiqlash kodi eshitilmadi — matnni to'liq va aniq o'qing" : "Yozuvda rozilik so'zi (\"roziman\") eshitilmadi",
        422,
      );
    }

    const existing = await this.db.query<{ provider_voice_id: string }>("SELECT provider_voice_id FROM voice_profiles WHERE clone_id = $1", [cloneId]);
    const { voiceId } = await this.cloner!.createVoice(`${consent.display_name} (AI Clone ${cloneId.slice(0, 8)})`, input.samples);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE voice_consents SET status = 'verified', transcript = $2, recording = $3, recording_mime = $4, ip = $5, verified_at = now() WHERE id = $1", [
        input.consentId,
        transcript,
        Buffer.from(input.consent.data),
        input.consent.mimeType,
        input.ip ?? null,
      ]);
      await client.query(
        `INSERT INTO voice_profiles (tenant_id, clone_id, consent_id, provider, provider_voice_id) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (clone_id) DO UPDATE SET consent_id = EXCLUDED.consent_id, provider = EXCLUDED.provider, provider_voice_id = EXCLUDED.provider_voice_id, created_at = now()`,
        [tenantId, cloneId, input.consentId, this.cloner!.id, voiceId],
      );
      await client.query("INSERT INTO audit_log (tenant_id, actor, action, target) VALUES ($1, 'owner', 'voice.enroll', $2)", [tenantId, cloneId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      await this.cloner!.deleteVoice(voiceId).catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    // Eski ovoz provayderdan o'chiriladi (qayta yozib olinganda).
    if (existing.rows[0]) await this.cloner!.deleteVoice(existing.rows[0].provider_voice_id).catch(() => {});
    return { provider: this.cloner!.id };
  }

  async status(tenantId: string, cloneId: string) {
    const { rows } = await this.db.query<{ voice_mode: VoiceMode; provider: string | null; created_at: Date | null; plan: string; plan_expires_at: Date | null; used: string }>(
      `SELECT c.voice_mode, p.provider, p.created_at, t.plan, t.plan_expires_at,
              coalesce((SELECT sum(tts_chars) FROM usage_ledger u WHERE u.tenant_id = t.id AND u.day >= date_trunc('month', current_date)), 0) AS used
         FROM clones c JOIN tenants t ON t.id = c.tenant_id LEFT JOIN voice_profiles p ON p.clone_id = c.id
        WHERE c.id = $1 AND c.tenant_id = $2`,
      [cloneId, tenantId],
    );
    const r = rows[0];
    if (!r) throw new VoiceError("Klon topilmadi", 404);
    const plan = r.plan_expires_at && r.plan_expires_at.getTime() < this.now().getTime() ? "free" : r.plan;
    return {
      available: Boolean(this.cloner && this.stt),
      enrolled: Boolean(r.provider),
      provider: r.provider,
      enrolledAt: r.created_at,
      mode: r.voice_mode,
      minutesIncluded: VOICE_MINUTES[plan] ?? 0,
      minutesUsed: Math.round((Number(r.used) / CHARS_PER_SECOND / 60) * 10) / 10,
    };
  }

  async setMode(tenantId: string, cloneId: string, mode: VoiceMode): Promise<void> {
    if (mode !== "off") {
      const s = await this.status(tenantId, cloneId);
      if (!s.enrolled) throw new VoiceError("Avval ovozni yozib oling", 409);
    }
    await withTenant(this.db, tenantId, (tx) => tx.query("UPDATE clones SET voice_mode = $2 WHERE id = $1", [cloneId, mode]));
  }

  /** Rozilikni qaytarib olish: provayderdagi ovoz o'chiriladi, rozilik yozuvi tozalanadi. */
  async revoke(tenantId: string, cloneId: string): Promise<boolean> {
    const { rows } = await this.db.query<{ provider_voice_id: string; consent_id: string }>("SELECT provider_voice_id, consent_id FROM voice_profiles WHERE clone_id = $1 AND tenant_id = $2", [cloneId, tenantId]);
    const p = rows[0];
    if (!p) return false;
    if (this.cloner) await this.cloner.deleteVoice(p.provider_voice_id);
    await this.db.query("DELETE FROM voice_profiles WHERE clone_id = $1", [cloneId]);
    await this.db.query("UPDATE voice_consents SET status = 'revoked', revoked_at = now(), recording = NULL WHERE clone_id = $1 AND status = 'verified'", [cloneId]);
    await this.db.query("UPDATE clones SET voice_mode = 'off' WHERE id = $1", [cloneId]);
    await this.db.query("INSERT INTO audit_log (tenant_id, actor, action, target) VALUES ($1, 'owner', 'voice.revoke', $2)", [tenantId, cloneId]);
    return true;
  }

  /** Dashboard uchun: ixtiyoriy matnni egasining ovozida eshitib ko'rish (kvotadan yechiladi). */
  async preview(tenantId: string, cloneId: string, text: string): Promise<{ audio: Uint8Array; mimeType: string }> {
    if (!this.cloner) throw new VoiceError("Ovoz provayderi sozlanmagan", 503);
    const s = await this.status(tenantId, cloneId);
    if (!s.enrolled) throw new VoiceError("Avval ovozni yozib oling", 409);
    const clipped = text.slice(0, 300);
    if (s.minutesUsed * 60 * CHARS_PER_SECOND + clipped.length > s.minutesIncluded * 60 * CHARS_PER_SECOND) throw new VoiceError("Bu oy uchun ovoz daqiqalari tugagan — tarifni oshiring", 403);
    const { rows } = await this.db.query<{ provider_voice_id: string }>("SELECT provider_voice_id FROM voice_profiles WHERE clone_id = $1 AND tenant_id = $2", [cloneId, tenantId]);
    const out = await this.cloner.synthesize(rows[0]!.provider_voice_id, clipped);
    await this.db.query(
      `INSERT INTO usage_ledger (tenant_id, day, tts_chars) VALUES ($1, current_date, $2)
       ON CONFLICT (tenant_id, day) DO UPDATE SET tts_chars = usage_ledger.tts_chars + EXCLUDED.tts_chars`,
      [tenantId, clipped.length],
    );
    return out;
  }

  /**
   * Javobni egasining ovozida tayyorlaydi (rejim, kvota va ovoz mavjud bo'lsa), aks holda null.
   * Suhbatdagi birinchi ovozli javob AI ekanini ovozda aytadi (oshkoralik, 04-hujjat §3.3).
   */
  async synthesizeReply(
    tenantId: string,
    cloneId: string,
    input: { conversationId: string; text: string; userSentVoice: boolean },
  ): Promise<{ audio: Uint8Array; mimeType: string } | null> {
    if (!this.cloner) return null;
    const s = await this.status(tenantId, cloneId);
    if (!s.enrolled) return null;
    if (s.mode === "off" || (s.mode === "voice_in" && !input.userSentVoice)) return null;

    const { rows } = await this.db.query<{ provider_voice_id: string; display_name: string; voiced: boolean }>(
      `SELECT p.provider_voice_id, c.display_name,
              EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = $2 AND m.flags->>'voiceReply' = 'true') AS voiced
         FROM voice_profiles p JOIN clones c ON c.id = p.clone_id WHERE p.clone_id = $1`,
      [cloneId, input.conversationId],
    );
    const p = rows[0];
    if (!p) return null;
    let text = input.text.slice(0, MAX_TTS_CHARS);
    if (!p.voiced) text = `Men ${p.display_name}ning AI-kloniman. ${text}`;
    const usedChars = s.minutesUsed * 60 * CHARS_PER_SECOND;
    if (usedChars + text.length > s.minutesIncluded * 60 * CHARS_PER_SECOND) return null;

    const out = await this.cloner.synthesize(p.provider_voice_id, text);
    await this.db.query(
      `INSERT INTO usage_ledger (tenant_id, day, tts_chars) VALUES ($1, current_date, $2)
       ON CONFLICT (tenant_id, day) DO UPDATE SET tts_chars = usage_ledger.tts_chars + EXCLUDED.tts_chars`,
      [tenantId, text.length],
    );
    await this.db.query(
      `UPDATE messages SET flags = flags || '{"voiceReply": true}'::jsonb
        WHERE id = (SELECT id FROM messages WHERE conversation_id = $1 AND role = 'assistant' ORDER BY created_at DESC LIMIT 1)`,
      [input.conversationId],
    );
    return out;
  }
}
