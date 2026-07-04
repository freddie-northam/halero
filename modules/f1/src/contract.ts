// Pure API types shared by the F1 module's server and web halves. No
// runtime, no imports of either side's deps, so both can import it.

/** Whether a session is finished, running, or still ahead. */
export type SessionState = "done" | "live" | "upcoming";

/** Widget footprint on the board grid. */
export type WidgetSize = "s" | "m" | "l";

/** One placed widget on a board. `config` is widget-type specific. */
export interface WidgetInstance {
  readonly instanceId: string;
  readonly type: string;
  readonly size: WidgetSize;
  readonly config: Record<string, unknown>;
}

/** A named, user-arranged dashboard of widgets. */
export interface Board {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly layout: readonly WidgetInstance[];
}

/** A single session inside a weekend. */
export interface SessionLite {
  readonly entityId: string;
  readonly sessionKey: number;
  readonly sessionName: string;
  readonly sessionType: string;
  readonly dateStart: string | null;
  readonly dateEnd: string | null;
  readonly state: SessionState;
}

/** A race weekend (meeting) with its sessions. */
export interface Weekend {
  readonly meetingKey: number;
  readonly meetingName: string | null;
  readonly countryName: string | null;
  readonly countryCode: string | null;
  readonly countryFlagUrl: string | null;
  readonly circuitShortName: string | null;
  readonly circuitImageUrl: string | null;
  readonly circuitInfoUrl: string | null;
  readonly location: string | null;
  readonly dateStart: string | null;
  readonly dateEnd: string | null;
  readonly round: number;
  readonly state: SessionState;
  readonly sessions: readonly SessionLite[];
}

export interface SeasonSchedule {
  readonly year: number;
  readonly weekends: readonly Weekend[];
}

/** The next upcoming session and the weekend it belongs to. */
export interface NextUp {
  readonly session: SessionLite | null;
  readonly weekend: Weekend | null;
}

export interface DriverStanding {
  readonly driverNumber: number;
  readonly fullName: string | null;
  readonly nameAcronym: string | null;
  readonly teamName: string | null;
  readonly teamColour: string | null;
  readonly headshotUrl: string | null;
  readonly position: number | null;
  readonly points: number | null;
  readonly positionStart: number | null;
  readonly pointsStart: number | null;
}

export interface TeamStanding {
  readonly teamName: string;
  readonly teamColour: string | null;
  readonly position: number | null;
  readonly points: number | null;
  readonly positionStart: number | null;
  readonly pointsStart: number | null;
}

export interface ResultRow {
  readonly position: number | null;
  readonly driverNumber: number;
  readonly fullName: string | null;
  readonly nameAcronym: string | null;
  readonly teamName: string | null;
  readonly teamColour: string | null;
  readonly headshotUrl: string | null;
  readonly points: number | null;
  readonly dnf: boolean;
  readonly dns: boolean;
  readonly dsq: boolean;
  readonly gapToLeader: string | null;
  readonly numberOfLaps: number | null;
}

export interface SessionResult {
  readonly sessionKey: number;
  readonly sessionName: string;
  readonly sessionType: string;
  readonly meetingName: string | null;
  readonly rows: readonly ResultRow[];
}

// --- phase 2: race explorer ----------------------------------------------

/** A pointer to one finished session, for a widget's session dropdown. */
export interface RaceSessionRef {
  readonly sessionKey: number;
  readonly label: string;
  readonly sessionType: string;
  readonly dateStart: string | null;
  readonly meetingName: string | null;
}

/** One driver's timing for a single lap. */
export interface LapPoint {
  readonly lapNumber: number;
  readonly lapDuration: number | null;
  readonly durationSector1: number | null;
  readonly durationSector2: number | null;
  readonly durationSector3: number | null;
  readonly i1Speed: number | null;
  readonly i2Speed: number | null;
  readonly stSpeed: number | null;
  readonly isPitOutLap: boolean;
  readonly dateStart: string | null;
}

/** Driver metadata shared by every per-driver detail series. */
export interface DriverMeta {
  readonly driverNumber: number;
  readonly nameAcronym: string | null;
  readonly fullName: string | null;
  readonly teamName: string | null;
  readonly teamColour: string | null;
}

export interface DriverLaps extends DriverMeta {
  readonly laps: readonly LapPoint[];
}

/** One tyre stint (a run on one set of tyres between pit stops). */
export interface Stint {
  readonly stintNumber: number;
  readonly lapStart: number | null;
  readonly lapEnd: number | null;
  readonly compound: string | null;
  readonly tyreAgeAtStart: number | null;
}

export interface DriverStints extends DriverMeta {
  readonly stints: readonly Stint[];
}

/** A single pit stop, with the driver it belongs to. */
export interface PitStop extends DriverMeta {
  readonly lapNumber: number;
  readonly date: string | null;
  readonly laneDuration: number | null;
  readonly stopDuration: number | null;
}

/** A driver's track position sampled at one instant. */
export interface PositionPoint {
  readonly date: string;
  readonly position: number | null;
}

export interface DriverPositions extends DriverMeta {
  readonly points: readonly PositionPoint[];
}

/** One race-control message (flags, safety car, investigations). */
export interface RaceControlMessage {
  readonly date: string | null;
  readonly lapNumber: number | null;
  readonly category: string | null;
  readonly flag: string | null;
  readonly scope: string | null;
  readonly sector: number | null;
  readonly driverNumber: number | null;
  readonly message: string | null;
}

/**
 * One team-radio clip, with a playable recording url when present. The
 * driver is nullable (some clips are marshal/race-director calls), so this
 * carries the meta fields directly rather than extending DriverMeta.
 */
export interface TeamRadioClip {
  readonly driverNumber: number | null;
  readonly nameAcronym: string | null;
  readonly fullName: string | null;
  readonly teamName: string | null;
  readonly teamColour: string | null;
  readonly date: string | null;
  readonly recordingUrl: string | null;
}

/** One overtake: the passer, the passed, and where it happened. */
export interface Overtake {
  readonly date: string | null;
  readonly position: number | null;
  readonly overtakingDriverNumber: number | null;
  readonly overtakingAcronym: string | null;
  readonly overtakingColour: string | null;
  readonly overtakenDriverNumber: number | null;
  readonly overtakenAcronym: string | null;
  readonly overtakenColour: string | null;
}

/** One weather sample over the course of a session. */
export interface WeatherPoint {
  readonly date: string;
  readonly airTemperature: number | null;
  readonly trackTemperature: number | null;
  readonly humidity: number | null;
  readonly pressure: number | null;
  readonly rainfall: number | null;
  readonly windSpeed: number | null;
  readonly windDirection: number | null;
}

/** One place on the starting grid, derived from qualifying. */
export interface GridSlot {
  readonly position: number | null;
  readonly driverNumber: number;
  readonly nameAcronym: string | null;
  readonly fullName: string | null;
  readonly teamName: string | null;
  readonly teamColour: string | null;
  readonly headshotUrl: string | null;
}

// --- phase 3: live timing ------------------------------------------------

/** Whether the user's OpenF1 live-timing credential is stored. */
export interface LiveStatus {
  readonly connected: boolean;
}

/** The current/most-recent session, and whether it is live right now. */
export interface LiveSession {
  readonly sessionKey: number;
  readonly sessionName: string;
  readonly sessionType: string;
  readonly meetingName: string | null;
  readonly countryName: string | null;
  readonly countryFlagUrl: string | null;
  readonly circuitShortName: string | null;
  readonly dateStart: string | null;
  readonly dateEnd: string | null;
  readonly isLive: boolean;
}

/** One row of the live timing tower: a driver's current standing. */
export interface TimingRow {
  readonly position: number | null;
  readonly driverNumber: number;
  readonly nameAcronym: string | null;
  readonly fullName: string | null;
  readonly teamName: string | null;
  readonly teamColour: string | null;
  readonly gapToLeader: string | null;
  readonly interval: string | null;
  readonly compound: string | null;
  readonly tyreAge: number | null;
  readonly lastLap: number | null;
}

/**
 * The live timing payload. `rows` is empty (and `requiresCredential` true)
 * when a session is live but no credential is stored, so the UI can prompt
 * to connect without erroring.
 */
export interface LiveTiming {
  readonly session: LiveSession | null;
  readonly rows: readonly TimingRow[];
  readonly requiresCredential: boolean;
}

/** The current conditions during a live session. */
export interface LiveWeather {
  readonly date: string | null;
  readonly airTemperature: number | null;
  readonly trackTemperature: number | null;
  readonly humidity: number | null;
  readonly rainfall: number | null;
  readonly windSpeed: number | null;
  readonly windDirection: number | null;
}
