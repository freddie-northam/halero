// The reference keeps the *.sql module declaration in the program of
// every package that typechecks against @halero/db sources.
/// <reference path="./sql.d.ts" />
import migration0001Core from "../migrations/0001_core.sql" with {
  type: "text",
};
import migration0002ConnectionBackoff from "../migrations/0002_connection_backoff.sql" with {
  type: "text",
};
import migration0003ExternalRefStreams from "../migrations/0003_external_ref_streams.sql" with {
  type: "text",
};
import migration0004Tasks from "../migrations/0004_tasks.sql" with {
  type: "text",
};
import migration0005ApiTokens from "../migrations/0005_api_tokens.sql" with {
  type: "text",
};
import migration0006TasksBoard from "../migrations/0006_tasks_board.sql" with {
  type: "text",
};
import migration0007Notes from "../migrations/0007_notes.sql" with {
  type: "text",
};
import migration0008CalendarEventNotesUrl from "../migrations/0008_calendar_event_notes_url.sql" with {
  type: "text",
};
import migration0009Activity from "../migrations/0009_activity.sql" with {
  type: "text",
};

export interface Migration {
  readonly name: string;
  readonly sql: string;
}

// The explicit manifest of every migration this build knows about.
// Migrations are embedded at build time (no directory scanning at
// runtime) so a compiled binary always knows its expected set.
export const coreMigrations: readonly Migration[] = [
  { name: "0001_core", sql: migration0001Core },
  { name: "0002_connection_backoff", sql: migration0002ConnectionBackoff },
  { name: "0003_external_ref_streams", sql: migration0003ExternalRefStreams },
  { name: "0004_tasks", sql: migration0004Tasks },
  { name: "0005_api_tokens", sql: migration0005ApiTokens },
  { name: "0006_tasks_board", sql: migration0006TasksBoard },
  { name: "0007_notes", sql: migration0007Notes },
  {
    name: "0008_calendar_event_notes_url",
    sql: migration0008CalendarEventNotesUrl,
  },
  { name: "0009_activity", sql: migration0009Activity },
];
