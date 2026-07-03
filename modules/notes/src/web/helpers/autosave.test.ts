import { describe, expect, test } from "bun:test";
import type { NoteDocument } from "../../contract";
import { type AutosaveTimers, createAutosaver } from "./autosave";

/** A hand-driven clock: one pending callback, fired on demand. */
const makeFakeTimers = () => {
  let pending: (() => void) | null = null;
  let nextHandle = 1;
  const timers: AutosaveTimers = {
    set: (fn) => {
      pending = fn;
      nextHandle += 1;
      return nextHandle as unknown as ReturnType<typeof setTimeout>;
    },
    clear: () => {
      pending = null;
    },
  };
  return {
    timers,
    tick: () => {
      const fn = pending;
      pending = null;
      fn?.();
    },
    isArmed: () => pending !== null,
  };
};

const doc = (text: string): NoteDocument => [
  { type: "paragraph", content: [{ type: "text", text }] },
];

describe("createAutosaver", () => {
  test("saves once after the debounce elapses", () => {
    const saved: NoteDocument[] = [];
    const clock = makeFakeTimers();
    const autosaver = createAutosaver<NoteDocument>(
      (d) => saved.push(d),
      800,
      clock.timers,
    );

    autosaver.schedule(doc("a"));
    expect(saved).toHaveLength(0);
    clock.tick();
    expect(saved).toEqual([doc("a")]);
  });

  test("collapses a burst into a single save of the latest snapshot", () => {
    const saved: NoteDocument[] = [];
    const clock = makeFakeTimers();
    const autosaver = createAutosaver<NoteDocument>(
      (d) => saved.push(d),
      800,
      clock.timers,
    );

    autosaver.schedule(doc("a"));
    autosaver.schedule(doc("ab"));
    autosaver.schedule(doc("abc"));
    clock.tick();

    expect(saved).toEqual([doc("abc")]);
  });

  test("flush saves the pending snapshot immediately and disarms", () => {
    const saved: NoteDocument[] = [];
    const clock = makeFakeTimers();
    const autosaver = createAutosaver<NoteDocument>(
      (d) => saved.push(d),
      800,
      clock.timers,
    );

    autosaver.schedule(doc("draft"));
    autosaver.flush();

    expect(saved).toEqual([doc("draft")]);
    expect(clock.isArmed()).toBe(false);
    // A stale timer must not fire a second save after a flush.
    clock.tick();
    expect(saved).toHaveLength(1);
  });

  test("flush with nothing pending is a no-op", () => {
    const saved: NoteDocument[] = [];
    const clock = makeFakeTimers();
    const autosaver = createAutosaver<NoteDocument>(
      (d) => saved.push(d),
      800,
      clock.timers,
    );

    autosaver.flush();

    expect(saved).toHaveLength(0);
  });

  test("cancel drops the pending snapshot without saving", () => {
    const saved: NoteDocument[] = [];
    const clock = makeFakeTimers();
    const autosaver = createAutosaver<NoteDocument>(
      (d) => saved.push(d),
      800,
      clock.timers,
    );

    autosaver.schedule(doc("gone"));
    autosaver.cancel();
    clock.tick();

    expect(saved).toHaveLength(0);
  });
});
