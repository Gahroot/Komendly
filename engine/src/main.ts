// Engine entrypoint.
import { chromium } from "playwright";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { startHttp } from "./http/server";
import { errMsg, log } from "./log";
import { createProvider } from "./providers/index";
import { Runner } from "./runner";
import { createStorage } from "./storage/s3";
import { createSmtpSender, smtpConfigured } from "./lifecycle/mail";
import { startLifecycleLoop } from "./lifecycle/send";
import { startGrowthLoop } from "./lifecycle/growth";
import { startOutboundLoop } from "./outbound/loop";

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
  // Lifecycle emails (off until AdsFeatureFlag lifecycle_email is on). Without SMTP it only logs.
  const send = smtpConfigured() ? createSmtpSender() : async (m: { to: string; subject: string }) => log("info", "lifecycle email (SMTP not configured, logged)", { to: m.to, subject: m.subject });
  const stopLifecycle = startLifecycleLoop({ db, provider, send, storage });
  // Growth loops: gift-ready / referral-reward emails + referral credit expiry sweep.
  const stopGrowth = startGrowthLoop({ db, send });
  // Cold outbound: lead finding on request; sending only with OUTBOUND_ENABLED=1 + flag "outbound". Reply alerts use our normal mailer.
  const alertTo = process.env.ADS_ALERT_EMAIL || process.env.SMTP_REPLY_TO;
  const stopOutbound = startOutboundLoop({
    db,
    provider,
    alert: async (subject, text) => {
      if (alertTo) await send({ to: alertTo, subject, text, html: "", headers: {} });
    },
  });
  log("info", "engine started", { worker: config.workerId, port: config.port, provider: provider.name, concurrency: config.concurrency, providerOk: runner.providerHealthy });

  let shutting = false;
  const shutdown = (sig: string) => {
    if (shutting) return;
    shutting = true;
    log("info", "signal", { sig });
    void (async () => {
      server.close();
      stopLifecycle();
      stopGrowth();
      stopOutbound();
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
