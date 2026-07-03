// The DatePicker's tz-safety is the whole point of this file: the popover
// opens on whichever month `value` (or "now", when null) resolves to in
// the LOCAL timezone, and a click on a day must round-trip through
// onChange as that exact visible day, in any timezone. Day 15 sits in the
// middle of every month, so it never collides with an outside-month day
// from the previous or next month's lead-in/lead-out days.

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { act, useState } from "react";
import { registerHappyDom, unregisterHappyDom } from "../test/happy-dom";
import { DatePicker } from "./date-picker";

beforeAll(() => {
  registerHappyDom();
});
afterEach(cleanup);
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await unregisterHappyDom();
});

const withTimeZone = async (
  timeZone: string,
  run: () => Promise<void>,
): Promise<void> => {
  const original = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    await run();
  } finally {
    process.env.TZ = original;
  }
};

/** A thin controlled harness: DatePicker itself takes no internal state. */
const ControlledDatePicker = ({
  initial = null,
  onChange,
}: {
  readonly initial?: string | null;
  readonly onChange?: (value: string | null) => void;
}) => {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <DatePicker
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      aria-label="Due date"
    />
  );
};

type View = ReturnType<typeof render>;

/**
 * Popover positioning settles asynchronously (Radix measures the trigger
 * after mount), so opening and closing both need the async act wrapper to
 * keep that update inside React's test scope (the tasks module's
 * toggle-invalidate pattern).
 */
const clickInsideAct = (view: View, name: string): Promise<void> =>
  act(async () => {
    fireEvent.click(view.getByText(name));
  });

const openPicker = (view: View): Promise<void> =>
  act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Due date" }));
  });

/** The 15th of whatever month is currently open, in the given timezone. */
const midMonthLocalDateString = (): string => {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-15`;
};

describe("DatePicker", () => {
  test("shows the placeholder when the value is null", () => {
    const view = render(<ControlledDatePicker />);
    expect(view.getByRole("button", { name: "Due date" })).toBeTruthy();
    expect(view.getByText("Pick a date")).toBeTruthy();
  });

  test("opening the trigger shows the calendar's weekday header", async () => {
    const view = render(<ControlledDatePicker />);
    await openPicker(view);

    expect(view.getByText("Mon")).toBeTruthy();
    expect(view.getByText("Sun")).toBeTruthy();
  });

  for (const timeZone of ["Pacific/Midway", "UTC", "Pacific/Kiritimati"]) {
    test(`selecting the 15th emits that exact day under ${timeZone}`, async () => {
      await withTimeZone(timeZone, async () => {
        const emitted: (string | null)[] = [];
        const view = render(
          <ControlledDatePicker onChange={(v) => emitted.push(v)} />,
        );
        await openPicker(view);

        await clickInsideAct(view, "15");

        expect(emitted).toEqual([midMonthLocalDateString()]);
      });
    });
  }

  test("selecting a day closes the popover", async () => {
    const view = render(<ControlledDatePicker />);
    await openPicker(view);
    await clickInsideAct(view, "15");

    expect(view.queryByText("Mon")).toBeNull();
  });

  test("Clear emits null and closes the popover", async () => {
    const emitted: (string | null)[] = [];
    const view = render(
      <ControlledDatePicker
        initial={midMonthLocalDateString()}
        onChange={(v) => emitted.push(v)}
      />,
    );
    await openPicker(view);

    await clickInsideAct(view, "Clear");

    expect(emitted).toEqual([null]);
    expect(view.queryByText("Mon")).toBeNull();
    expect(view.getByText("Pick a date")).toBeTruthy();
  });

  test("Clear is disabled when there is nothing to clear", async () => {
    const view = render(<ControlledDatePicker />);
    await openPicker(view);

    expect((view.getByText("Clear") as HTMLButtonElement).disabled).toBe(true);
  });
});
