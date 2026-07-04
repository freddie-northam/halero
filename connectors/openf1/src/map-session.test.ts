import { describe, expect, test } from "bun:test";
import { F1_SESSION_SCHEMA_VERSION, mapSession } from "./map-session";

const raceSession = {
  session_key: 9472,
  meeting_key: 1229,
  session_name: "Race",
  session_type: "Race",
  year: 2024,
  date_start: "2024-03-02T15:00:00+00:00",
  date_end: "2024-03-02T17:00:00+00:00",
  gmt_offset: "03:00:00",
  circuit_key: 63,
  circuit_short_name: "Sakhir",
  country_code: "BRN",
  country_name: "Bahrain",
  location: "Sakhir",
  is_cancelled: false,
};

const meeting = {
  meetingName: "Bahrain Grand Prix",
  countryFlagUrl: "https://flags/bahrain.png",
  circuitImageUrl: "https://circuits/bahrain.png",
  circuitInfoUrl: "https://api.multiviewer.app/api/v1/circuits/63/2024",
};

describe("mapSession", () => {
  test("maps a session joined with its meeting into an upsert", () => {
    const op = mapSession(raceSession, meeting);
    expect(op).not.toBeNull();
    if (op === null) return;
    expect(op.op).toBe("upsert");
    expect(op.externalId).toBe("9472");
    expect(op.spine.kind).toBe("f1.session");
    expect(op.spine.schemaVersion).toBe(F1_SESSION_SCHEMA_VERSION);
    expect(op.spine.title).toBe("Bahrain Grand Prix — Race");
    expect(op.spine.snippet).toBe("Sakhir · Bahrain");
    expect(op.spine.occurredStart).toBe(
      Date.parse("2024-03-02T15:00:00+00:00"),
    );
    expect(op.spine.occurredEnd).toBe(Date.parse("2024-03-02T17:00:00+00:00"));
  });

  test("denormalizes the meeting display fields into the satellite", () => {
    const op = mapSession(raceSession, meeting);
    if (op === null) throw new Error("expected an op");
    const satellite = op.satellite as Record<string, unknown>;
    expect(satellite.sessionKey).toBe(9472);
    expect(satellite.meetingName).toBe("Bahrain Grand Prix");
    expect(satellite.countryFlagUrl).toBe("https://flags/bahrain.png");
    expect(satellite.circuitImageUrl).toBe("https://circuits/bahrain.png");
    expect(satellite.isCancelled).toBe(false);
  });

  test("returns null when the row lacks the keys an entity needs", () => {
    expect(mapSession({ session_name: "Race" }, meeting)).toBeNull();
    expect(
      mapSession({ ...raceSession, session_key: undefined }, meeting),
    ).toBeNull();
  });

  test("falls back to the country name when no meeting is joined", () => {
    // Without the meeting join there is no meeting name, so the title uses
    // the session's own country name instead.
    const op = mapSession(raceSession, undefined);
    if (op === null) throw new Error("expected an op");
    expect(op.spine.title).toBe("Bahrain — Race");
    const satellite = op.satellite as Record<string, unknown>;
    expect(satellite.meetingName).toBeNull();
    expect(satellite.countryFlagUrl).toBeNull();
  });

  test("folds mutable fields into the version marker", () => {
    const a = mapSession(raceSession, meeting);
    const b = mapSession({ ...raceSession, is_cancelled: true }, meeting);
    expect(a?.version).not.toBe(b?.version);
  });

  test("omits occurred fields when the dates are missing", () => {
    const op = mapSession(
      { ...raceSession, date_start: null, date_end: null },
      meeting,
    );
    if (op === null) throw new Error("expected an op");
    expect(op.spine.occurredStart).toBeUndefined();
    expect(op.spine.occurredEnd).toBeUndefined();
  });
});
