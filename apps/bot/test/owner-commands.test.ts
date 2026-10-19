import { describe, expect, it } from "vitest";
import { escalationNotice, parseOwnerCommand } from "../src/owner-commands.js";

const id = "0b6f6f2e-3a7c-4c1e-9a55-2d3f1e8b9c10";

describe("parseOwnerCommand", () => {
  it("/reply buyrug'ini ko'p qatorli matn bilan tushunadi", () => {
    expect(parseOwnerCommand(`/reply ${id} Salom!\nErtaga qo'ng'iroq qilaman`)).toEqual({ kind: "reply", conversationId: id, text: "Salom!\nErtaga qo'ng'iroq qilaman" });
  });

  it("bot nomi qo'shilgan buyruqni tushunadi", () => {
    expect(parseOwnerCommand(`/takeover@dilnoza_bot ${id}`)).toEqual({ kind: "takeover", conversationId: id });
    expect(parseOwnerCommand(`/bot ${id.toUpperCase()}`)).toEqual({ kind: "bot", conversationId: id });
  });

  it("noto'g'ri formatni rad etadi", () => {
    expect(parseOwnerCommand("/reply 123 salom")).toBeNull();
    expect(parseOwnerCommand(`/reply ${id}`)).toBeNull();
    expect(parseOwnerCommand("salom")).toBeNull();
  });
});

describe("escalationNotice", () => {
  it("sabab, lid belgisi va buyruqlarni ko'rsatadi", () => {
    const text = escalationNotice({ conversationId: id, userName: "Ali", message: "Kursga yozilmoqchiman", reasons: ["purchase_intent"], leadCaptured: true });
    expect(text).toContain("Yangi lid · sotib olish niyati");
    expect(text).toContain(`/reply ${id}`);
  });
});
