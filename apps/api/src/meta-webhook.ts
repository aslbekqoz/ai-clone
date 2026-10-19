import { stripCitationMarkers, type MetaInbound, type SpeechToText } from "@ai-clone/core";
import type { CloneService, MetaChannels } from "@ai-clone/db";

export interface MetaProcessResult {
  handled: number;
  skipped: number;
}

/** Kiruvchi Meta xabarlarini klonga beradi va javobni o'sha kanal orqali qaytaradi. */
export async function processMetaInbound(svc: CloneService, meta: MetaChannels, events: MetaInbound[], stt?: SpeechToText | null): Promise<MetaProcessResult> {
  let handled = 0;
  let skipped = 0;
  for (const ev of events) {
    const ch = await meta.resolveByAccount(ev.kind, ev.accountId);
    if (!ch || !(await meta.markProcessed(ev.messageId))) {
      skipped++;
      continue;
    }

    let text = ev.text;
    let voice = false;
    if (!text && ev.audioMediaId) {
      const media = stt ? await meta.downloadWhatsAppMedia(ch, ev.audioMediaId) : null;
      if (!stt || !media) {
        await meta.send(ch, ev.senderId, "🎙 Hozircha ovozli xabarni o'qiy olmadim — savolingizni yozib yuboring, iltimos.");
        handled++;
        continue;
      }
      const t = await stt.transcribe(media.data, { filename: "voice.ogg", mimeType: media.mimeType });
      text = t.text;
      voice = true;
    }
    if (!text) {
      skipped++;
      continue;
    }

    const out = await svc.chat(ch.tenantId, ch.cloneId, {
      channel: ev.kind,
      externalId: ev.senderId,
      message: text,
      ...(ev.senderName ? { name: ev.senderName } : {}),
      ...(voice ? { meta: { voice: true } } : {}),
    });
    if (out.reply) {
      const sources = out.citations.map((c) => (c.url ? `• ${c.title}: ${c.url}` : `• ${c.title}`));
      const body = stripCitationMarkers(out.reply);
      await meta.send(ch, ev.senderId, sources.length ? `${body}\n\n📚 Manba:\n${sources.join("\n")}` : body);
    }
    handled++;
  }
  return { handled, skipped };
}
