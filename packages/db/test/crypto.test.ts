import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseSecretKey } from "../src/index.js";

describe("kanal tokenlarini shifrlash", () => {
  const key = randomBytes(32);

  it("shifrlab ochadi, har safar boshqa shifrmatn", () => {
    const a = encryptSecret("123456789:AAtoken", key);
    expect(a).not.toContain("AAtoken");
    expect(a).not.toBe(encryptSecret("123456789:AAtoken", key));
    expect(decryptSecret(a, key)).toBe("123456789:AAtoken");
  });

  it("o'zgartirilgan shifrmatn yoki boshqa kalit bilan ochilmaydi", () => {
    const enc = encryptSecret("secret", key);
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"), key)).toThrow();
    expect(() => decryptSecret(enc, randomBytes(32))).toThrow();
  });

  it("kalitni base64 va hex formatida qabul qiladi", () => {
    expect(parseSecretKey(key.toString("base64")).equals(key)).toBe(true);
    expect(parseSecretKey(key.toString("hex")).equals(key)).toBe(true);
    expect(() => parseSecretKey("qisqa")).toThrow(/32/);
    expect(() => parseSecretKey(undefined)).toThrow(/CHANNEL_SECRET_KEY/);
  });
});
