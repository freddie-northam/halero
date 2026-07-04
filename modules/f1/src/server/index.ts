// The F1 module's server entry: its manifest, the f1.session kind
// contribution (with the satellite writer the OpenF1 connector's ops flow
// through), and the F1 router. The host wires all of it in through its
// module registry; nothing here imports host code.

import { defineServerModule } from "@halero/module-sdk/server";
import { F1_SESSION_KIND, f1SessionSatelliteSchema } from "@halero/schemas";
import { F1_SESSION_SCHEMA_VERSION, f1Router } from "./router";
import { writeF1SessionSatellite } from "./satellite";

export { F1_SESSION_SCHEMA_VERSION } from "./router";

export const f1ServerModule = defineServerModule({
  id: "f1",
  version: "0.1.0",
  entityKinds: [
    {
      kind: F1_SESSION_KIND,
      schemaVersion: F1_SESSION_SCHEMA_VERSION,
      schema: f1SessionSatelliteSchema,
      satelliteWriter: writeF1SessionSatellite,
    },
  ],
  router: f1Router,
});

export type {
  Board,
  DriverStanding,
  LiveSession,
  LiveStatus,
  LiveTiming,
  LiveWeather,
  SeasonSchedule,
  SessionResult,
  TeamStanding,
  TimingRow,
  Weekend,
} from "../contract";
