import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseMetaWebhook, verifyMetaSignature, waRecipient } from "../src/index.js";

describe("Meta webhook", () => {
  it("X-Hub-Signature-256 imzosini tekshiradi", () => {
    const body = JSON.stringify({ object: "instagram" });
    const sig = "sha256=" + createHmac("sha256", "app-secret").update(body).digest("hex");
    expect(verifyMetaSignature(body, sig, "app-secret")).toBe(true);
    expect(verifyMetaSignature(body + " ", sig, "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, sig, "boshqa-sir")).toBe(false);
    expect(verifyMetaSignature(body, undefined, "app-secret")).toBe(false);
  });

  it("Instagram xabarlarini ajratadi, echo va o'chirilganlarni tashlaydi", () => {
    const events = parseMetaWebhook({
      object: "instagram",
      entry: [
        {
          id: "17841400000000001",
          messaging: [
            { sender: { id: "IGSID-1" }, recipient: { id: "17841400000000001" }, message: { mid: "m1", text: " Kurs narxi? " } },
            { sender: { id: "17841400000000001" }, recipient: { id: "IGSID-1" }, message: { mid: "m2", text: "Javob", is_echo: true } },
            { sender: { id: "IGSID-2" }, recipient: { id: "17841400000000001" }, message: { mid: "m3", is_deleted: true } },
            { sender: { id: "IGSID-3" }, recipient: { id: "17841400000000001" }, read: { mid: "m1" } },
          ],
        },
      ],
    });
    expect(events).toEqual([{ kind: "instagram", accountId: "17841400000000001", senderId: "IGSID-1", messageId: "m1", text: "Kurs narxi?" }]);
  });

  it("WhatsApp matn va ovozli xabarlarini ajratadi, statuslarni tashlaydi", () => {
    const events = parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "106540352242922" },
                contacts: [{ wa_id: "998901234567", profile: { name: "Ali" } }],
                messages: [
                  { from: "998901234567", id: "wamid.1", type: "text", text: { body: "Salom" } },
                  { from: "998901234567", id: "wamid.2", type: "audio", audio: { id: "media-9" } },
                  { from: "998901234567", id: "wamid.3", type: "sticker" },
                ],
              },
            },
            { field: "messages", value: { metadata: { phone_number_id: "106540352242922" }, statuses: [{ id: "wamid.0", status: "read" }] } as never },
          ],
        },
      ],
    });
    expect(events).toEqual([
      { kind: "whatsapp", accountId: "106540352242922", senderId: "998901234567", senderName: "Ali", messageId: "wamid.1", text: "Salom" },
      { kind: "whatsapp", accountId: "106540352242922", senderId: "998901234567", senderName: "Ali", messageId: "wamid.2", audioMediaId: "media-9" },
    ]);
    expect(waRecipient("998901234567")).toBe("+998901234567");
  });

  it("noma'lum obyekt va bo'sh payload", () => {
    expect(parseMetaWebhook({ object: "page" })).toEqual([]);
    expect(parseMetaWebhook(null)).toEqual([]);
  });
});
