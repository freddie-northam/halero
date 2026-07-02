// The Today page greeting is pure clock arithmetic: the screen feeds it
// the current instant and the HOME timezone (never the browser's), so
// the words match the day the owner's calendar is actually living in.

export type Greeting = "Good morning" | "Good afternoon" | "Good evening";

/** Morning is [05:00, 12:00), afternoon [12:00, 18:00), evening the rest. */
export const greetingForHour = (hour: number): Greeting => {
  if (hour >= 5 && hour < 12) {
    return "Good morning";
  }
  if (hour >= 12 && hour < 18) {
    return "Good afternoon";
  }
  return "Good evening";
};

/** The hour of day (0-23) of an instant in the given IANA timezone. */
export const hourInZone = (epochMs: number, timeZone: string): number =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(epochMs),
  );
