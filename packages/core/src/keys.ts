import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HEX_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

const parseHexKey = (hex: string): Uint8Array =>
  Uint8Array.from(Buffer.from(hex, "hex"));

const loadEnvKey = (envKey: string): Uint8Array => {
  if (!HEX_KEY_PATTERN.test(envKey)) {
    throw new Error(
      "The HALERO_KEY environment variable must be exactly 64 hexadecimal characters (a 32-byte key). Fix or unset it to continue.",
    );
  }
  return parseHexKey(envKey);
};

const readKeyFile = (keyPath: string): Uint8Array => {
  const contents = readFileSync(keyPath, "utf8").trim();
  if (!HEX_KEY_PATTERN.test(contents)) {
    throw new Error(
      `The key file at ${keyPath} is not a valid 64-character hex key. It was left untouched because replacing it would make previously encrypted credentials unreadable. Restore the file from a backup, or delete it to start over.`,
    );
  }
  return parseHexKey(contents);
};

export const loadOrCreateKey = (dataDir: string): Uint8Array => {
  const envKey = process.env.HALERO_KEY;
  if (envKey !== undefined) {
    return loadEnvKey(envKey);
  }
  const keyPath = join(dataDir, "key");
  if (existsSync(keyPath)) {
    return readKeyFile(keyPath);
  }
  mkdirSync(dataDir, { recursive: true });
  const key = randomBytes(32);
  writeFileSync(keyPath, key.toString("hex"), { mode: 0o600 });
  return Uint8Array.from(key);
};
