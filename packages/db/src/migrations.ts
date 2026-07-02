import migration0001Core from "../migrations/0001_core.sql" with {
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
];
