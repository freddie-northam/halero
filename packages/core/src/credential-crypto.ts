import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Layout of an encrypted blob: iv (12 bytes) || ciphertext || auth tag (16 bytes).
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

const DECRYPT_ERROR =
  "The stored credentials could not be decrypted. The encryption key may have changed or the stored data may be corrupted. Reconnect the affected account to store fresh credentials.";

const assertKeyLength = (key: Uint8Array): void => {
  if (key.length !== KEY_LENGTH) {
    throw new Error("The credential encryption key must be exactly 32 bytes.");
  }
};

export const encryptCredentials = (
  key: Uint8Array,
  plaintext: string,
): Uint8Array => {
  assertKeyLength(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return Uint8Array.from(Buffer.concat([iv, ciphertext, cipher.getAuthTag()]));
};

export const decryptCredentials = (
  key: Uint8Array,
  blob: Uint8Array,
): string => {
  assertKeyLength(key);
  if (blob.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error(DECRYPT_ERROR);
  }
  const iv = blob.subarray(0, IV_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH, blob.length - TAG_LENGTH);
  const tag = blob.subarray(blob.length - TAG_LENGTH);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(DECRYPT_ERROR);
  }
};
