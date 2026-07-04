import { describe, expect, test } from "bun:test";
import { buildLiveSession, buildTimingRows } from "./live-data";

describe("buildTimingRows", () => {
  const drivers = [
    {
      driver_number: 1,
      name_acronym: "VER",
      full_name: "Max VERSTAPPEN",
      team_name: "Red Bull Racing",
      team_colour: "3671c6",
    },
    {
      driver_number: 16,
      name_acronym: "LEC",
      full_name: "Charles LECLERC",
      team_name: "Ferrari",
      team_colour: "e8002d",
    },
  ];
  // Oldest-first time series; the last sample per driver wins.
  const positions = [
    { driver_number: 1, position: 1, date: "2024-01-01T00:00:00Z" },
    { driver_number: 16, position: 3, date: "2024-01-01T00:00:00Z" },
    { driver_number: 16, position: 2, date: "2024-01-01T00:01:00Z" },
  ];
  const intervals = [
    { driver_number: 1, gap_to_leader: 0, interval: 0 },
    { driver_number: 16, gap_to_leader: 5.2, interval: 5.2 },
  ];
  const stints = [
    { driver_number: 1, lap_start: 1, compound: "SOFT", tyre_age_at_start: 0 },
    { driver_number: 1, lap_start: 18, compound: "HARD", tyre_age_at_start: 2 },
    {
      driver_number: 16,
      lap_start: 1,
      compound: "MEDIUM",
      tyre_age_at_start: 0,
    },
  ];

  test("merges the series into a tower sorted by position", () => {
    const rows = buildTimingRows(drivers, positions, intervals, stints);
    expect(rows.map((r) => r.driverNumber)).toEqual([1, 16]);
    expect(rows[0]?.position).toBe(1);
    expect(rows[1]?.position).toBe(2); // last sample, not the first (3)
  });

  test("takes the current stint (highest lap_start) for the tyre", () => {
    const rows = buildTimingRows(drivers, positions, intervals, stints);
    const ver = rows.find((r) => r.driverNumber === 1);
    expect(ver?.compound).toBe("HARD");
    expect(ver?.tyreAge).toBe(2);
  });

  test("formats a numeric gap and passes a lapped string through", () => {
    const rows = buildTimingRows(
      drivers,
      positions,
      [
        { driver_number: 1, gap_to_leader: 0, interval: 0 },
        { driver_number: 16, gap_to_leader: "+1 LAP", interval: "+1 LAP" },
      ],
      stints,
    );
    expect(rows.find((r) => r.driverNumber === 1)?.gapToLeader).toBe("+0.000");
    expect(rows.find((r) => r.driverNumber === 16)?.gapToLeader).toBe("+1 LAP");
  });
});

describe("buildLiveSession", () => {
  const base = {
    session_key: 100,
    session_name: "Race",
    session_type: "Race",
    meeting_name: "British Grand Prix",
    country_name: "United Kingdom",
    circuit_short_name: "Silverstone",
    date_start: "2026-07-05T14:00:00+00:00",
    date_end: "2026-07-05T16:00:00+00:00",
  };

  test("marks a session live when now is within its window", () => {
    const during = Date.parse("2026-07-05T15:00:00+00:00");
    expect(buildLiveSession(base, during)?.isLive).toBe(true);
  });

  test("marks a session not live before it starts or after it ends", () => {
    const before = Date.parse("2026-07-05T13:00:00+00:00");
    const after = Date.parse("2026-07-05T17:00:00+00:00");
    expect(buildLiveSession(base, before)?.isLive).toBe(false);
    expect(buildLiveSession(base, after)?.isLive).toBe(false);
  });

  test("returns null for a missing row", () => {
    expect(buildLiveSession(undefined, Date.now())).toBeNull();
  });
});
