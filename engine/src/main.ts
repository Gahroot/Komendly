// Engine entrypoint.
import { chromium } from "playwright";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { startHttp } from "./http/server";
import { errMsg, log } from "./log";
import { createProvider } from "./providers/index";
import { Runner } from "./runner";
import { createStorage } from "./storage/s3";

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDb();
  await db.$connect();
  const storage = createStorage();
  const provider = createProvider(config.aiProvider);
  const runner = new Runner({
    db,
    storage,
    provider,
    config,
    launchBrowser: () => chromium.launch({ args: ["--force-color-profile=srgb", "--font-render-hinting=none", "--disable-dev-shm-usage"] }),
  });
  const server = startHttp(config.port, db, () => ({ worker: config.workerId, ...runner.status() }));
  await runner.start();
  log("info", "engine started", { worker: config.workerId, port: config.port, provider: provider.name, concurrency: config.concurrency, providerOk: runner.providerHealthy });

  let shutting = false;
  const shutdown = (sig: string) => {
    if (shutting) return;
    shutting = true;
    log("info", "signal", { sig });
    void (async () => {
      server.close();
      await runner.stop();
      await db.$disconnect();
      process.exit(0);
    })();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((e) => {
  log("error", "engine failed to start", { error: errMsg(e) });
  process.exit(1);
});
