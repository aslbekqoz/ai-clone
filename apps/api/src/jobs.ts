import { OcrError, fetchYouTubeTranscript, type DocumentOcr, type MetaInbound, type SpeechToText } from "@ai-clone/core";
import { createWebhookDispatcher } from "@ai-clone/bot";
import { JobWorker, PermanentJobError, type CloneService, type JobHandler, type MetaChannels, type Runtime, type WorkerOptions } from "@ai-clone/db";
import type { Update } from "grammy/types";
import { processMetaEvent } from "./meta-webhook.js";

/** Navbat nomlari (API ham, worker ham shulardan foydalanadi). */
export const QUEUES = {
  telegram: "telegram.update",
  meta: "meta.inbound",
  youtube: "ingest.youtube",
  ocr: "ingest.ocr",
} as const;

export interface JobDeps {
  svc: CloneService;
  /** Webhook dispatcher'ining ishonchli varianti: sir allaqachon API'da tekshirilgan. */
  telegram?: ((botId: string, update: Update) => Promise<boolean>) | null;
  meta?: MetaChannels | null;
  stt?: SpeechToText | null;
  ocr?: DocumentOcr | null;
}

export type OcrImageType = "image/png" | "image/jpeg" | "image/webp";

/** Telegram'dagi bitta suhbat yangilanishlari tartib bilan qayta ishlanadi. */
export function telegramGroupKey(botId: string, update: Update): string {
  const chat = update.message?.chat.id ?? update.channel_post?.chat.id ?? update.edited_channel_post?.chat.id ?? update.my_chat_member?.chat.id ?? "other";
  return `tg:${botId}:${chat}`;
}

const PERMANENT_YT = /havolasi noto'g'ri|subtitr topilmadi|nutq aniqlanmadi/;

export function createJobHandlers(deps: JobDeps): Record<string, JobHandler> {
  const handlers: Record<string, JobHandler> = {
    [QUEUES.youtube]: async (job) => {
      const p = job.payload as { cloneId: string; url: string; title?: string };
      let tr;
      try {
        tr = await fetchYouTubeTranscript(p.url, { stt: deps.stt ?? null });
      } catch (err) {
        if (PERMANENT_YT.test((err as Error).message)) throw new PermanentJobError((err as Error).message);
        throw err;
      }
      const out = await deps.svc.addSections(job.tenantId!, p.cloneId, { type: "youtube", title: p.title ?? tr.title, uri: `https://youtu.be/${tr.videoId}`, sections: tr.sections });
      return { ...out, method: tr.method, language: tr.language ?? null };
    },
  };

  if (deps.ocr) {
    const ocr = deps.ocr;
    handlers[QUEUES.ocr] = async (job) => {
      const p = job.payload as { cloneId: string; kind: "pdf" | "image"; mimeType: string; title: string };
      if (!job.blob) throw new PermanentJobError("Fayl topilmadi");
      let sections;
      try {
        sections = p.kind === "pdf" ? await ocr.ocrPdf(job.blob) : await ocr.ocrImage(job.blob, p.mimeType as OcrImageType);
      } catch (err) {
        if (err instanceof OcrError) throw new PermanentJobError(`OCR: ${err.message}`);
        throw err;
      }
      if (!sections.length) throw new PermanentJobError("Hujjatda o'qiladigan matn topilmadi");
      const out = await deps.svc.addSections(job.tenantId!, p.cloneId, { type: "pdf", title: p.title, sections });
      return { ...out, sections: sections.length, ocr: true };
    };
  }

  if (deps.telegram) {
    const handle = deps.telegram;
    handlers[QUEUES.telegram] = async (job) => {
      const p = job.payload as { botId: string; update: Update };
      // Bot uzilgan bo'lsa — yangilanish endi hech kimga tegishli emas.
      if (!(await handle(p.botId, p.update))) return { skipped: "bot_disconnected" };
      return null;
    };
  }

  if (deps.meta) {
    const meta = deps.meta;
    handlers[QUEUES.meta] = async (job) => {
      const ev = job.payload.event as MetaInbound;
      const ch = await meta.resolveByAccount(ev.kind, ev.accountId);
      if (!ch) return { skipped: "channel_disconnected" };
      await processMetaEvent(deps.svc, meta, ch, ev, deps.stt ?? null);
      return null;
    };
  }

  return handlers;
}

/** Runtime'dan worker yig'adi (API ichida ham, alohida `pnpm worker` jarayonida ham). */
export function createRuntimeWorker(rt: Runtime, opts: WorkerOptions = {}): JobWorker | null {
  if (!rt.jobs) return null;
  const dispatch = rt.telegram ? createWebhookDispatcher(rt.service, rt.telegram, { stt: rt.stt, voice: rt.voice }) : null;
  const handlers = createJobHandlers({ svc: rt.service, telegram: dispatch?.handle ?? null, meta: rt.meta?.channels ?? null, stt: rt.stt, ocr: rt.ocr });
  return new JobWorker(rt.jobs, handlers, opts);
}
