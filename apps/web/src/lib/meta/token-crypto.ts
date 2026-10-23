import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for Meta access tokens at rest.
 * Key from META_ADS_TOKEN_ENCRYPTION_KEY or derived from SESSION_SECRET / APP_SECRET.
 */
function encryptionKey(): Buffer {
  const raw =
    process.env.META_ADS_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.META_ADS_APP_SECRET?.trim() ||
    "leadorbit-dev-meta-token-key";
  return createHash("sha256").update(raw).digest();
}

/** Returns `iv_b64:tag_b64:cipher_b64` */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid ciphertext payload");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
