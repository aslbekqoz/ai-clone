import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Kanal tokenlari uchun envelope'siz, sodda AES-256-GCM (04-hujjat §7). Kalit — CHANNEL_SECRET_KEY
// (32 bayt, base64 yoki hex). Prod'da kalit KMS/Vault'da saqlanadi; format versiyalangan ("v1"),
// shuning uchun keyinroq kalitni almashtirish (rotation) mumkin.

export function parseSecretKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error("CHANNEL_SECRET_KEY o'rnatilmagan (32 bayt: `openssl rand -base64 32`)");
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("CHANNEL_SECRET_KEY 32 bayt bo'lishi kerak");
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [version, iv, tag, ct] = payload.split(":");
  if (version !== "v1" || !iv || !tag || ct === undefined) throw new Error("Shifrlangan qiymat formati noto'g'ri");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}
