import { z } from "zod";

export const F1_SESSION_KIND = "f1.session";

/**
 * The f1.session satellite payload: one row per F1 session (Practice,
 * Qualifying, Sprint, Race) beside the entity spine. Produced by the
 * OpenF1 connector from the free `meetings` + `sessions` endpoints, so the
 * host validates it on the connector path. Meeting-level display fields
 * (GP name, flag, circuit image) are denormalized here so a schedule card
 * renders from one row without joining the meetings table.
 *
 * Nullability mirrors the OpenF1 responses: circuit/country metadata is
 * always present on a session, but the image/flag URLs and gmt offset can
 * be absent for older or partial data.
 */
export const f1SessionSatelliteSchema = z.object({
  /** OpenF1 session_key; the connector's external id for the session. */
  sessionKey: z.number().int(),
  meetingKey: z.number().int(),
  /** e.g. "Practice 1", "Qualifying", "Sprint", "Race". */
  sessionName: z.string(),
  /** e.g. "Practice", "Qualifying", "Race". */
  sessionType: z.string(),
  year: z.number().int(),
  /** ISO8601 session start/end (kept as strings for exact display). */
  dateStart: z.string().nullable(),
  dateEnd: z.string().nullable(),
  gmtOffset: z.string().nullable(),
  circuitKey: z.number().int().nullable(),
  circuitShortName: z.string().nullable(),
  countryName: z.string().nullable(),
  countryCode: z.string().nullable(),
  location: z.string().nullable(),
  /** Grand Prix / meeting name, e.g. "Bahrain Grand Prix". */
  meetingName: z.string().nullable(),
  countryFlagUrl: z.string().nullable(),
  circuitImageUrl: z.string().nullable(),
  circuitInfoUrl: z.string().nullable(),
  isCancelled: z.boolean(),
});

export type F1SessionSatellite = z.infer<typeof f1SessionSatelliteSchema>;
