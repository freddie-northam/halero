import { describe, expect, test } from "bun:test";
import {
  isImportantRaceControl,
  selectDueReminders,
  selectNewRaceControl,
} from "./notifications";

const iso = (ms: number): string => new Date(ms).toISOString();

describe("selectDueReminders", () => {
  const now = 1_000_000_000_000;
  const lead = 15 * 60 * 1000;
  const candidate = (sessionKey: number, startMs: number) => ({
    sessionKey,
    dateStart: iso(startMs),
    label: `Session ${sessionKey}`,
  });

  test("returns a session starting inside the lead window", () => {
    const { due, reminded } = selectDueReminders(
      [candidate(1, now + 5 * 60 * 1000)],
      now,
      [],
      lead,
    );
    expect(due.map((d) => d.sessionKey)).toEqual([1]);
    expect(reminded).toContain(1);
  });

  test("does not re-remind a session already in the reminded set", () => {
    const { due } = selectDueReminders(
      [candidate(1, now + 5 * 60 * 1000)],
      now,
      [1],
      lead,
    );
    expect(due).toHaveLength(0);
  });

  test("ignores sessions beyond the window and prunes past ones", () => {
    const { due, reminded } = selectDueReminders(
      [candidate(2, now + 60 * 60 * 1000)],
      now,
      [1], // key 1 is in the past (not in the candidate list) -> pruned
      lead,
    );
    expect(due).toHaveLength(0);
    expect(reminded).not.toContain(1);
  });

  test("skips sessions with no or unparseable start", () => {
    const { due } = selectDueReminders(
      [{ sessionKey: 3, dateStart: null, label: "x" }],
      now,
      [],
      lead,
    );
    expect(due).toHaveLength(0);
  });
});

describe("isImportantRaceControl", () => {
  test("flags red, safety car, and chequered as important", () => {
    expect(
      isImportantRaceControl({
        date: null,
        flag: "RED",
        category: null,
        message: null,
      }),
    ).toBe(true);
    expect(
      isImportantRaceControl({
        date: null,
        flag: null,
        category: "SafetyCar",
        message: null,
      }),
    ).toBe(true);
    expect(
      isImportantRaceControl({
        date: null,
        flag: null,
        category: "Other",
        message: "SAFETY CAR DEPLOYED",
      }),
    ).toBe(true);
    expect(
      isImportantRaceControl({
        date: null,
        flag: null,
        category: "Flag",
        message: "CHEQUERED FLAG",
      }),
    ).toBe(true);
  });

  test("treats routine green/yellow messages as not important", () => {
    expect(
      isImportantRaceControl({
        date: null,
        flag: "GREEN",
        category: "Flag",
        message: "GREEN LIGHT",
      }),
    ).toBe(false);
    expect(
      isImportantRaceControl({
        date: null,
        flag: "YELLOW",
        category: "Flag",
        message: "YELLOW IN SECTOR 1",
      }),
    ).toBe(false);
  });
});

describe("selectNewRaceControl", () => {
  const msgs = [
    {
      date: "2026-07-05T14:00:00+00:00",
      flag: "GREEN",
      category: "Flag",
      message: "GREEN",
    },
    {
      date: "2026-07-05T14:30:00+00:00",
      flag: "RED",
      category: "Flag",
      message: "RED FLAG",
    },
    {
      date: "2026-07-05T15:00:00+00:00",
      flag: null,
      category: "SafetyCar",
      message: "SAFETY CAR",
    },
  ];

  test("returns important messages newer than the watermark", () => {
    const result = selectNewRaceControl(msgs, "2026-07-05T14:15:00+00:00");
    expect(result.important.map((m) => m.message)).toEqual([
      "RED FLAG",
      "SAFETY CAR",
    ]);
    expect(result.seenAt).toBe("2026-07-05T15:00:00+00:00");
  });

  test("with no watermark, advances to the newest and returns the important ones", () => {
    const result = selectNewRaceControl(msgs, null);
    expect(result.important).toHaveLength(2);
    expect(result.seenAt).toBe("2026-07-05T15:00:00+00:00");
  });

  test("returns nothing new when the watermark is already at the newest", () => {
    const result = selectNewRaceControl(msgs, "2026-07-05T15:00:00+00:00");
    expect(result.important).toHaveLength(0);
    expect(result.seenAt).toBe("2026-07-05T15:00:00+00:00");
  });
});
