import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const errorCode = (error: unknown): string | undefined =>
  error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;

const readKeyFile = (keyPath: string): Uint8Array => {
  const contents = ((): string => {
    try {
      return readFileSync(keyPath, "utf8").trim();
    } catch (error) {
      throw new Error(
        `The key file at ${keyPath} exists but could not be read. Check that it is a regular file readable by the user running Halero.`,
        { cause: error },
      );
    }
  })();
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
  try {
    mkdirSync(dataDir, { recursive: true });
  } catch (error) {
    throw new Error(
      `Halero could not create its data directory at ${dataDir}. A file may already exist with that name, or the location may not be writable.`,
      { cause: error },
    );
  }
  const keyPath = join(dataDir, "key");
  const key = randomBytes(32);
  try {
    // "wx" creates the file only if none exists yet, in one syscall:
    // there is no window between an existence check and the write, so
    // two processes starting at once cannot overwrite each other's key.
    writeFileSync(keyPath, key.toString("hex"), { mode: 0o600, flag: "wx" });
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      // The key already exists (or another start just won the race);
      // that stored key is the real one.
      return readKeyFile(keyPath);
    }
    throw new Error(
      `Halero could not write its key file at ${keyPath}. Check that the data directory is writable.`,
      { cause: error },
    );
  }
  return Uint8Array.from(key);
};
