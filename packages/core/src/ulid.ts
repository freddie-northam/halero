// ULID generation: 26 Crockford base32 characters encoding a 48-bit
// timestamp followed by 80 bits of randomness. Same-millisecond calls
// increment the randomness so IDs stay monotonic within this process.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;
const MAX_TIME = 2 ** 48 - 1;

// Each slot holds one base32 digit (0..31), 16 digits = 80 random bits.
const state = {
  lastTime: Number.NaN,
  random: new Uint8Array(RANDOM_LENGTH),
};

const encodeTime = (time: number): string => {
  const chars = new Array<string>(TIME_LENGTH);
  let remaining = time;
  for (let i = TIME_LENGTH - 1; i >= 0; i -= 1) {
    chars[i] = ALPHABET.charAt(remaining % 32);
    remaining = Math.floor(remaining / 32);
  }
  return chars.join("");
};

const encodeRandom = (): string => {
  let out = "";
  for (let i = 0; i < RANDOM_LENGTH; i += 1) {
    out += ALPHABET.charAt(state.random[i] ?? 0);
  }
  return out;
};

const refreshRandom = (): void => {
  crypto.getRandomValues(state.random);
  for (let i = 0; i < RANDOM_LENGTH; i += 1) {
    state.random[i] = (state.random[i] ?? 0) & 31;
  }
};

const incrementRandom = (): void => {
  for (let i = RANDOM_LENGTH - 1; i >= 0; i -= 1) {
    const digit = state.random[i] ?? 0;
    if (digit < 31) {
      state.random[i] = digit + 1;
      return;
    }
    state.random[i] = 0;
  }
  throw new Error(
    "Could not generate a new ID: too many IDs were created in the same millisecond. Please try again.",
  );
};

export const ulid = (now?: number): string => {
  const time = now ?? Date.now();
  if (!Number.isInteger(time) || time < 0 || time > MAX_TIME) {
    throw new Error(
      "Could not generate a new ID: the timestamp must be a whole number of milliseconds within the 48-bit ULID range.",
    );
  }
  if (time === state.lastTime) {
    incrementRandom();
  } else {
    refreshRandom();
    state.lastTime = time;
  }
  return encodeTime(time) + encodeRandom();
};
