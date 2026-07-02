import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { decryptCredentials, encryptCredentials } from "./credential-crypto";

const makeKey = (): Uint8Array => Uint8Array.from(randomBytes(32));

describe("credential crypto", () => {
  test("round-trips a plaintext string", () => {
    const key = makeKey();
    const plaintext = JSON.stringify({ token: "secret", scope: "calendar" });

    const blob = encryptCredentials(key, plaintext);

    expect(decryptCredentials(key, blob)).toBe(plaintext);
  });

  test("uses a fresh IV for every call", () => {
    const key = makeKey();

    const first = encryptCredentials(key, "same plaintext");
    const second = encryptCredentials(key, "same plaintext");

    expect(first.subarray(0, 12)).not.toEqual(second.subarray(0, 12));
    expect(first).not.toEqual(second);
  });

  test("a tampered blob throws a readable error", () => {
    const key = makeKey();
    const blob = encryptCredentials(key, "secret");
    const tampered = Uint8Array.from(blob);
    const target = 12;
    tampered[target] = (tampered[target] ?? 0) ^ 0xff;

    expect(() => decryptCredentials(key, tampered)).toThrow(
      /credentials could not be decrypted/,
    );
  });

  test("the wrong key throws a readable error", () => {
    const blob = encryptCredentials(makeKey(), "secret");

    expect(() => decryptCredentials(makeKey(), blob)).toThrow(
      /credentials could not be decrypted/,
    );
  });

  test("a truncated blob throws a readable error", () => {
    const key = makeKey();

    expect(() => decryptCredentials(key, new Uint8Array(8))).toThrow(
      /credentials could not be decrypted/,
    );
  });

  test("a decrypt failure keeps the underlying cause", () => {
    const blob = encryptCredentials(makeKey(), "secret");

    const thrown = ((): unknown => {
      try {
        decryptCredentials(makeKey(), blob);
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect(thrown).toBeInstanceOf(Error);
    // The readable message is for people; the cause keeps the original
    // OpenSSL error for logs and debugging.
    expect((thrown as Error).cause).toBeInstanceOf(Error);
  });

  test("rejects keys that are not 32 bytes", () => {
    expect(() => encryptCredentials(new Uint8Array(16), "secret")).toThrow(
      /32 bytes/,
    );
  });
});
