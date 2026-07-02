import { createApp } from "./app";
import { boot } from "./boot";
import { loadConfig } from "./config";
import { createSyncRunner } from "./sync/runner";
import { createScheduler } from "./sync/scheduler";

const config = loadConfig(process.env);
const { database, key } = boot(config);
const now = (): number => Date.now();

// One shared runner: manual syncNow and the scheduler tick go through
// the same run path, so they share the in-flight guard and reschedule
// logic. The scheduler lives here, not in createApp, so tests never
// start timers by building an app.
const syncRunner = createSyncRunner({
  database,
  key,
  now,
  googleFetch: fetch,
  random: Math.random,
});
const app = createApp({ config, database, key, syncRunner });
const scheduler = createScheduler({ db: database.db, now, runner: syncRunner });

Bun.serve({ port: config.port, fetch: app.fetch });
scheduler.start();

console.log(
  `Halero is running at ${config.baseUrl.href} (data directory: ${config.dataDir})`,
);
