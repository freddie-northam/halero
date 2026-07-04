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
