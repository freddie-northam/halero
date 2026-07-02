import { describe, expect, test } from "bun:test";
import { ulid } from "./ulid";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const decodeTime = (id: string): number => {
  let time = 0;
  for (const char of id.slice(0, 10)) {
    time = time * 32 + ALPHABET.indexOf(char);
  }
  return time;
};

describe("ulid", () => {
  test("produces 26 characters from the Crockford base32 alphabet", () => {
    const id = ulid();

    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
  });

  test("orders lexicographically across milliseconds", () => {
    const earlier = ulid(1_000);
    const later = ulid(2_000);

    expect(earlier < later).toBe(true);
  });

  test("is monotonic for same-millisecond calls", () => {
    const first = ulid(5_000);
    const second = ulid(5_000);
    const third = ulid(5_000);

    expect(first < second).toBe(true);
    expect(second < third).toBe(true);
    expect(second.slice(0, 10)).toBe(first.slice(0, 10));
  });

  test("encodes a decodable timestamp", () => {
    const now = 1_719_000_000_123;

    const id = ulid(now);

    expect(decodeTime(id)).toBe(now);
  });

  test("rejects timestamps outside the 48-bit range", () => {
    expect(() => ulid(-1)).toThrow(/48/);
    expect(() => ulid(2 ** 48)).toThrow(/48/);
  });
});
