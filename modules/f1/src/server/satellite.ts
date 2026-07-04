// The f1.session satellite writer. The OpenF1 connector produces
// f1.session ops; the sync engine resolves this writer through the module
// registry and calls it to store the session's fields beside the spine row.

import { f1Sessions } from "@halero/db";
import type { SatelliteWriter } from "@halero/module-sdk/server";
import { f1SessionSatelliteSchema } from "@halero/schemas";

const SATELLITE_SHAPE_MESSAGE =
  "The OpenF1 connector sent session details in a shape Halero does not " +
  "recognize. This is a connector bug; syncing stopped.";

export const writeF1SessionSatellite: SatelliteWriter = (db, entityId, op) => {
  const parsed = f1SessionSatelliteSchema.safeParse(op.satellite ?? {});
  if (!parsed.success) {
    throw new Error(SATELLITE_SHAPE_MESSAGE);
  }
  const s = parsed.data;
  const values = {
    entityId,
    sessionKey: s.sessionKey,
    meetingKey: s.meetingKey,
    sessionName: s.sessionName,
    sessionType: s.sessionType,
    year: s.year,
    dateStart: s.dateStart,
    dateEnd: s.dateEnd,
    gmtOffset: s.gmtOffset,
    circuitKey: s.circuitKey,
    circuitShortName: s.circuitShortName,
    countryName: s.countryName,
    countryCode: s.countryCode,
    location: s.location,
    meetingName: s.meetingName,
    countryFlagUrl: s.countryFlagUrl,
    circuitImageUrl: s.circuitImageUrl,
    circuitInfoUrl: s.circuitInfoUrl,
    isCancelled: s.isCancelled ? 1 : 0,
    raw: op.raw === undefined ? null : JSON.stringify(op.raw),
  };
  db.insert(f1Sessions)
    .values(values)
    .onConflictDoUpdate({ target: f1Sessions.entityId, set: values })
    .run();
};
