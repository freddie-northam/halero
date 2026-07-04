import { join } from "node:path";
import { websocket } from "hono/bun";
import { createApp } from "./app";
import { boot } from "./boot";
import { loadConfig } from "./config";
import { createF1NotificationJob } from "./f1-live/notifications";
import { createSchedulerHealth } from "./healthz";
import { createNotifier } from "./notifier";
import { createMaintenanceJob } from "./sync/maintenance";
import { createSyncRunner } from "./sync/runner";
import { createScheduler } from "./sync/scheduler";

const config = loadConfig(process.env);
const { database, key } = boot(config);
const now = (): number => Date.now();

// One shared runner: manual syncNow and the scheduler tick go through
// the same run path, so they share the in-flight guard and reschedule
// logic. The scheduler lives here, not in createApp, so tests never
// start timers by building an app.
// One notifier for scheduled runs, manual runs, and the test-send
// mutation; it reads notify_url per send, so it carries no state.
const notifier = createNotifier({ db: database.db, notifyFetch: fetch });
const syncRunner = createSyncRunner({
  database,
  key,
  now,
  outboundFetch: fetch,
  random: Math.random,
  notifier,
});
// One shared liveness state: the scheduler writes it, /healthz reads it.
const schedulerHealth = createSchedulerHealth();
const app = createApp({
  config,
  database,
  key,
  syncRunner,
  schedulerHealth,
  notifier,
});
// Daily backups ride the scheduler's start/stop switch: same backups
// directory as the migration runner's pre-* snapshots, which rotation
// never touches.
const maintenance = createMaintenanceJob({
  sqlite: database.sqlite,
  backupsDir: join(config.dataDir, "backups"),
  now,
});
// F1 notifications ride the same lifecycle switch: session-start reminders
// and (with a live credential) big race-control events, both best-effort
// through the same notify_url as sync failures.
const f1Notifications = createF1NotificationJob({
  db: database.db,
  key,
  now,
  outboundFetch: fetch,
  notifier,
});
const scheduler = createScheduler(
  { db: database.db, now, runner: syncRunner, health: schedulerHealth },
  { maintenance, jobs: [f1Notifications] },
);

// websocket handler drives the Developer terminal's PTY sockets; it is
// inert unless HALERO_DEVELOPER_TERMINAL opted the route in.
Bun.serve({ port: config.port, fetch: app.fetch, websocket });
scheduler.start();

console.log(
  `Halero is running at ${config.baseUrl.href} (data directory: ${config.dataDir})`,
);
