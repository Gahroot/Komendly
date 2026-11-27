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
import { startBonusLoop } from "./bonuses/loop";
import { startWeeklyLoop } from "./jobs/weekly";
import { startCheckoutRecoveryLoop } from "./growth/checkout-recovery";
import { startWinbackLoop } from "./growth/winback";
import { startOfferIntelLoop } from "./offerintel/weekly";
import { startProofLoop } from "./growth/proof";
import { startCustomerSuccessLoop } from "./customersuccess/loop";
import { startFreeToolsLoop } from "./growth/free-tools";
import { startIndustryExamplesLoop } from "./growth/industry-examples";
import { startViralBrandingLoop } from "./growth/viral-branding";
import { startReelsLoop } from "./growth/reels";
import { startOptimizerLoop } from "./optimizer/run";
import { startExecStrategyLoop } from "./exec/strategy";
import { startProductIntelLoop } from "./productintel/loop";
import { startCustomerMemoryLoop } from "./customerintel/tick";
import { startAiAssistantLoop } from "./growth/ai-assistant";
import { startShopifyLoop } from "./growth/shopify";
import { startAdWatchLoop } from "./growth/ad-watch";
import { startAdCheckLoop } from "./growth/ad-check";
import { startAdlibReportLoop } from "./growth/adlib-report";
import { startMonitorLoop } from "./jobs/monitor";
import { startMetaResultsLoop } from "./growth/meta-results";
import { startRevenueSnapshotLoop } from "./revenue/snapshot";
import { startProductEngineLoop } from "./productintel/run";
import { startTeamOpsLoop } from "./jobs/team-ops";
import { startOpsLoop } from "./ops/loop";
import { startExecLoop } from "./exec/coordinate";
import { startOpsControlLoop } from "./ops/control";
import { startAiGatewayLoop } from "./aigateway/loop";
import { startBusinessOpsLoop } from "./ops/business";

// Crash safety: a failure in ONE background loop (sync start error or a stray rejected promise from a timer) must never take the
// whole engine (revenue work: ad rendering, Studio turns) down. Log and carry on; the loop's own heartbeat/ledger shows it as silent.
process.on("unhandledRejection", (reason) => log("error", "unhandled rejection (engine kept running)", { error: errMsg(reason) }));
function safeStart<T extends () => void>(name: string, start: () => T): () => void {
  try { return start(); } catch (e) { log("error", "loop failed to start (engine kept running)", { loop: name, error: errMsg(e) }); return () => undefined; }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDb();
  await db.$connect();
  const storage = createStorage();
  // CODEX_SHARED_STORE=db: the Codex login is shared with Kly through the CodexCredential row.
  const provider = createProvider(config.aiProvider, process.env, { db, by: "engine" });
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
  const stopLifecycle = safeStart("startLifecycleLoop", () => startLifecycleLoop({ db, provider, send, storage }));
  // Growth loops: gift-ready / referral-reward emails + referral credit expiry sweep.
  const stopGrowth = safeStart("startGrowthLoop", () => startGrowthLoop({ db, send }));
  // Ozzy Ad Department bonuses (check-up, 30-day plan, hook library); ADS_BONUSES=0 turns it off.
  const stopBonuses = safeStart("startBonusLoop", () => startBonusLoop(db));
  // Weekly Drop (Ad Department): Monday ads + "Your new ads are ready" email. ADS_WEEKLY_DROP=0 disables creation.
  const stopWeekly = safeStart("startWeeklyLoop", () => startWeeklyLoop({ db, send }));
  // Autopilot growth: free /tools AI jobs (sys_free_tools) + industry ad examples (sys_industry_examples). Off until flagged on.
  const stopFreeTools = safeStart("startFreeToolsLoop", () => startFreeToolsLoop({ db, worker: config.workerId }));
  const stopIndustryExamples = safeStart("startIndustryExamplesLoop", () => startIndustryExamplesLoop({ db }));
  // reels (sys_reels): Ozzy short videos rendered + reviewed for kly to publish (off until flagged on).
  const stopReels = safeStart("startReelsLoop", () => startReelsLoop({ db, storage }));
  // optimizer (sys_optimizer; digest sys_optimizer_digest): weekly diagnose/decide/act business loop, allow-listed actions only (docs/revenue/optimizer.md).
  const stopOptimizer = safeStart("startOptimizerLoop", () => startOptimizerLoop({ db, send }));
  // exec strategy (sys_exec_strategy): business context, stage, constraint, objectives above the optimiser; hold_and_measure by default (docs/exec/prd/).
  const stopExecStrategy = safeStart("startExecStrategyLoop", () => startExecStrategyLoop({ db, send }));
  // product intel (sys_creative_qa, sys_outcome_verify): report-only creative scores/findings, customer outcome failures, effectiveness ledger (docs/product/outcomes.md).
  const stopProductIntel = safeStart("startProductIntelLoop", () => startProductIntelLoop({ db, storage, send }));
  // customer memory refresh (sys_customer_memory, default OFF): rebuilds per-business memory daily; planner use needs sys_customer_memory_planner.
  const stopCustomerMemory = safeStart("startCustomerMemoryLoop", () => startCustomerMemoryLoop({ db }));
  // viral_branding (sys_viral_branding): hourly made_with visits/sign-ups + "free renders carry the mark" check.
  const stopViral = safeStart("startViralBrandingLoop", () => startViralBrandingLoop(db));
  // ai_assistant (sys_ai_assistant): hourly real MCP check against production + assistant sign-ups/tool calls.
  const stopAiAssistant = safeStart("startAiAssistantLoop", () => startAiAssistantLoop(db));
  // Shopify App Store (sys_shopify): hourly installs/charges count + public endpoint synthetic check.
  const stopShopify = safeStart("startShopifyLoop", () => startShopifyLoop(db));
  // data_report (sys_data_report): monthly Ad Library report refresh from KlyPlace source=adlib, else heartbeat only.
  const stopAdlibReport = safeStart("startAdlibReportLoop", () => startAdlibReportLoop({ db, provider }));
  // System-failure alerts (growth systems + Codex provider) to ADS_ALERT_EMAIL, every 10 min.
  const stopMonitor = safeStart("startMonitorLoop", () => startMonitorLoop({ db, send }));
  // Abandoned-checkout recovery (growth system checkout_recovery; off until AdsFeatureFlag sys_checkout_recovery).
  const stopRecovery = safeStart("startCheckoutRecoveryLoop", () => startCheckoutRecoveryLoop({ db, provider, send }));
  // Churn & failed-payment win-back (growth system winback; off until AdsFeatureFlag sys_winback).
  const stopWinback = safeStart("startWinbackLoop", () => startWinbackLoop({ db, provider, send }));
  // Offer intelligence (growth system offer_intel; off until AdsFeatureFlag sys_offer_intel): weekly objection map, offer gap, copy experiments, coherence check.
  const stopOfferIntel = safeStart("startOfferIntelLoop", () => startOfferIntelLoop({ db, provider }));
  // Live-in-7-days nudges, first wins, day-14/30 measured results + consent, cancel save, guarantee alerts (each off until its sys_ flag).
  const stopProof = safeStart("startProofLoop", () => startProofLoop({ db, send }));
  // Revenue lifecycle: nurture, activation rescue, reactivation, expansion, daily customer-success agent (each off until its sys_ flag).
  const stopCustomerSuccess = safeStart("startCustomerSuccessLoop", () => startCustomerSuccessLoop({ db, provider, send }));
  // Meta Ad Check grader (sys_ad_check): fills AdJob adlib_scan rows from the public Ad Library. Stopped on process exit.
  const stopAdCheck = safeStart("startAdCheckLoop", () => startAdCheckLoop({ db, provider, worker: config.workerId }));
  const stopAdWatch = safeStart("startAdWatchLoop", () => startAdWatchLoop({ db, provider, send })); // Competitor ad watch (sys_ad_watch): Monday opt-in emails
  // "Are my ads working?" weekly Meta results (growth system meta_results; off until AdsFeatureFlag sys_meta_results).
  const stopMetaResults = safeStart("startMetaResultsLoop", () => startMetaResultsLoop({ db, provider }));
  // Ozzy's team campaign operations (sys_team_ops; team_ops_kill pauses everything): launch, budget guard, daily analyst.
  const stopTeamOps = safeStart("startTeamOpsLoop", () => startTeamOpsLoop({ db, storage }));
  // Revenue intelligence (sys_revenue_intel): one revenue_snapshot AdsEvent per UTC day (economics, #1 constraint, stage).
  const stopRevenue = safeStart("startRevenueSnapshotLoop", () => startRevenueSnapshotLoop(db));
  const stopOps = safeStart("startOpsLoop", () => startOpsLoop({ db, send })); // support tickets, infra watch, incidents (flags sys_support_ops / sys_infra_watch / sys_incidents, OFF)
  // Ops control (sys_ops_control / sys_ops_digest): daily system_status ledger snapshot + Monday owner brief (docs/ops/operating-manual.md).
  const stopOpsControl = safeStart("startOpsControlLoop", () => startOpsControlLoop({ db, send }));
  // Executive coordinator + weekly exec brief (sys_exec_coordinator / sys_exec_brief, OFF): routes approved objectives to allow-listed reversible actions (docs/exec/operating-model.md).
  // AI gateway (sys_ai_gateway): web AI requests run on the Codex subscription (docs/ops/ai-policy.md).
  const stopAiGateway = safeStart("startAiGatewayLoop", () => startAiGatewayLoop({ db }));
  const stopExec = safeStart("startExecLoop", () => startExecLoop({ db, send }));
  // Business ops (sys_finance_intel, sys_biz_admin, sys_partner_ops): P&L snapshots + Meta ad_spend capture, weekly obligations digest, partner statements/health. Never moves money (docs/ops/prd.md).
  const stopBusinessOps = safeStart("startBusinessOpsLoop", () => startBusinessOpsLoop({ db, send }));
  // Product intelligence (sys_reliability, sys_delivery_econ, sys_competitive, sys_product_loop): SLO snapshot, cost-to-deliver, scorecard proposals, weekly product backlog.
  const stopProductEngine = safeStart("startProductEngineLoop", () => startProductEngineLoop({ db, send }));
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
      stopBonuses();
      stopWeekly();
      stopRecovery();
      stopWinback();
      stopOfferIntel();
      stopProof();
      stopCustomerSuccess();
      stopAdCheck();
      stopRevenue();
      stopOps();
      stopOpsControl();
      stopExec();
      stopAiGateway();
      stopBusinessOps();
      stopProductEngine();
      stopAdWatch();
      stopFreeTools();
      stopIndustryExamples();
      stopReels();
      stopOptimizer();
      stopExecStrategy();
      stopProductIntel();
      stopCustomerMemory();
      stopViral();
      stopAiAssistant();
      stopShopify();
      stopAdlibReport();
      stopMonitor();
      stopMetaResults();
      stopTeamOps();
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
