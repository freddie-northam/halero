import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  coreMigrations,
  type HaleroDatabase,
  openDatabase,
  runMigrations,
} from "@halero/db";
import { createApp } from "./app";
import { loadConfig } from "./config";

export interface TestClock {
  value: number;
}

export interface TestApp {
  readonly app: ReturnType<typeof createApp>;
  readonly database: HaleroDatabase;
  readonly dir: string;
  readonly clock: TestClock;
  readonly key: Uint8Array;
}

export interface MakeTestAppOptions {
  readonly baseUrl?: string;
  readonly webDistDir?: string;
  readonly outboundFetch?: (
    input: string | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  readonly exportSnapshotDir?: string;
}

export const TEST_KEY: Uint8Array = Uint8Array.from(
  { length: 32 },
  (_, index) => index + 1,
);

export const makeTestApp = (options: MakeTestAppOptions = {}): TestApp => {
  const dir = mkdtempSync(join(tmpdir(), "halero-server-app-"));
  const database = openDatabase(join(dir, "halero.db"));
  runMigrations(database.sqlite, {
    migrations: coreMigrations,
    backupsDir: join(dir, "backups"),
  });
  const clock: TestClock = { value: 1_700_000_000_000 };
  const config = loadConfig({
    HALERO_DATA_DIR: dir,
    HALERO_BASE_URL: options.baseUrl,
  });
  const app = createApp({
    config,
    database,
    key: TEST_KEY,
    webDistDir: options.webDistDir ?? join(dir, "missing-dist"),
    now: () => clock.value,
    outboundFetch: options.outboundFetch,
    exportSnapshotDir: options.exportSnapshotDir,
  });
  return { app, database, dir, clock, key: TEST_KEY };
};

export interface TrpcCallOptions {
  readonly cookie?: string;
  readonly origin?: string;
}

export const trpcQuery = (
  app: TestApp["app"],
  procedure: string,
  options: TrpcCallOptions = {},
): Promise<Response> => {
  const headers: Record<string, string> = {};
  if (options.cookie !== undefined) {
    headers.cookie = options.cookie;
  }
  return Promise.resolve(
    app.fetch(
      new Request(`http://localhost/api/trpc/${procedure}`, { headers }),
    ),
  );
};

export const trpcMutation = (
  app: TestApp["app"],
  procedure: string,
  input: unknown,
  options: TrpcCallOptions = {},
): Promise<Response> => {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.cookie !== undefined) {
    headers.cookie = options.cookie;
  }
  if (options.origin !== undefined) {
    headers.origin = options.origin;
  }
  return Promise.resolve(
    app.fetch(
      new Request(`http://localhost/api/trpc/${procedure}`, {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      }),
    ),
  );
};

/** Runs first-time setup and returns a signed-in session cookie. */
export const completeSetup = async (app: TestApp["app"]): Promise<string> => {
  const res = await trpcMutation(app, "system.setup", setupInput);
  return sessionCookieFrom(res);
};

export const sessionCookieFrom = (res: Response): string => {
  const cookies = res.headers.getSetCookie();
  const found = cookies.find((cookie) => cookie.startsWith("halero_session="));
  if (found === undefined) {
    throw new Error("Expected a halero_session Set-Cookie header");
  }
  return found.split(";")[0] ?? "";
};

export const setupInput = {
  password: "correct horse battery",
  homeTimezone: "Europe/London",
};

export interface TrpcSuccess<T> {
  readonly result: { readonly data: T };
}

export interface StatusData {
  readonly needsSetup: boolean;
  readonly authenticated: boolean;
}
