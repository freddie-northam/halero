import { createApp } from "./app";
import { boot } from "./boot";
import { loadConfig } from "./config";

const config = loadConfig(process.env);
const { database } = boot(config);
const app = createApp({ config, database });

Bun.serve({ port: config.port, fetch: app.fetch });

console.log(
  `Halero is running at ${config.baseUrl.href} (data directory: ${config.dataDir})`,
);
