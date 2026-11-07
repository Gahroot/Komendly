// Seeds realistic fake Website2ads data on the DEV database so /admin/ads renders with data.
// Re-runnable: deletes previously seeded rows (workspaces named "[seed] ...") first.
// Usage: set -a; . ./.env.local; set +a; npx tsx scripts/ads-admin-seed.ts
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ADMIN_EMAIL = "admin@komendly.dev";
const DAY = 24 * 3600 * 1000;
const NOW = Date.now();

// Deterministic PRNG so the dataset is stable between runs.
let s = 42;
const rand = () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
const ago = (days: number) => new Date(NOW - days * DAY);

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex")}`;
}

const SITES = ["acme-bikes.com", "glowskin.co", "taskpilot.io", "barkbox-local.com", "fitforge.app", "kettle-coffee.co.uk", "ledgerly.com", "plantpal.shop", "nomadstay.travel", "brightdental.com", "codecraft.dev", "urbanyoga.studio", "solarsure.energy", "petpals.vet", "mealmagic.io", "quietdesk.co", "lumen-lighting.com", "tidyhome.services", "gearhub.store", "wordwise.ai"];
const PLANS = ["starter", "growth", "scale"] as const;
const CREDITS: Record<string, number> = { starter: 60, growth: 200, scale: 600 };

async function cleanup() {
  const old = await prisma.adsWorkspace.findMany({ where: { name: { startsWith: "[seed]" } }, select: { id: true } });
  const ids = old.map((w) => w.id);
  await prisma.adsEvent.deleteMany({ where: { workspaceId: { in: ids } } });
  await prisma.adJob.deleteMany({ where: { workspaceId: { in: ids } } });
  await prisma.adsTrialClaim.deleteMany({ where: { workspaceId: { in: ids } } });
  await prisma.adsWorkspace.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@seed.komendly.dev" } } });
  await prisma.engineHeartbeat.deleteMany({ where: { id: { startsWith: "seed-" } } });
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  await cleanup();

  const password = randomBytes(9).toString("base64url");
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: { email: ADMIN_EMAIL, name: "Ads Admin", passwordHash: hashPassword(password), isAdmin: true, emailVerifiedAt: new Date() },
    update: { passwordHash: hashPassword(password), isAdmin: true, emailVerifiedAt: new Date() },
  });

  const counts = { workspaces: 0, runs: 0, ads: 0, ledger: 0, events: 0, flags: 0, jobs: 0 };
  for (let i = 0; i < 40; i++) {
    const site = SITES[i % SITES.length] as string;
    const createdDays = 5 + Math.floor(rand() * 80);
    const user = await prisma.user.create({
      data: { email: `owner${i}@seed.komendly.dev`, name: `Seed Owner ${i}`, passwordHash: "seed:disabled", emailVerifiedAt: ago(createdDays), createdAt: ago(createdDays) },
    });
    const converts = rand() < 0.35;
    const churns = converts && rand() < 0.25;
    const pastDue = converts && !churns && rand() < 0.1;
    const plan = pick(PLANS);
    const ws = await prisma.adsWorkspace.create({
      data: {
        name: `[seed] ${site.split(".")[0]}`,
        ownerId: user.id,
        createdAt: ago(createdDays),
        trialUsedAt: ago(createdDays),
        adsPlan: converts ? plan : "trial",
        subscriptionStatus: churns ? "canceled" : pastDue ? "past_due" : converts ? "active" : "none",
        canceledAt: churns ? ago(Math.max(1, createdDays - 20)) : null,
        currentPeriodEnd: converts ? new Date(NOW + 12 * DAY) : null,
        stripeCustomerId: converts ? `cus_seed_${i}` : null,
        suspendedAt: i === 7 ? ago(2) : null,
        members: { create: { userId: user.id, role: "owner" } },
      },
    });
    counts.workspaces++;

    const events: { name: string; createdAt: Date; props?: object }[] = [{ name: "trial_started", createdAt: ago(createdDays) }];
    let balance = 0;
    const ledger: { delta: number; reason: "trial_grant" | "subscription_grant" | "reserve" | "release" | "topup"; createdAt: Date; note?: string; runId?: string; stripeRef?: string }[] = [
      { delta: 0, reason: "trial_grant", createdAt: ago(createdDays), note: "trial 10 static + 1 motion (tracked via trialUsedAt)", stripeRef: `trial:${ws.id}` },
    ];
    if (converts) {
      const paidDay = createdDays - (1 + Math.floor(rand() * 20));
      events.push({ name: "checkout_started", createdAt: ago(paidDay + 0.01) }, { name: "paid_converted", createdAt: ago(paidDay), props: { plan } });
      ledger.push({ delta: CREDITS[plan] ?? 60, reason: "subscription_grant", createdAt: ago(paidDay), stripeRef: `in_seed_${i}_1`, note: "plan credits" });
      if (rand() < 0.3) ledger.push({ delta: 50, reason: "topup", createdAt: ago(Math.max(0.5, paidDay - 3)), stripeRef: `checkout:cs_seed_${i}`, note: "top-up (50)" });
      if (churns) events.push({ name: "churned", createdAt: ago(Math.max(1, createdDays - 20)), props: { feedback: pick(["too_expensive", "missing_features", "low_quality", "unused"]), reason: "cancellation_requested" } });
    }

    const runCount = 1 + Math.floor(rand() * (converts ? 6 : 2));
    for (let r = 0; r < runCount; r++) {
      const day = Math.max(0.1, createdDays - r * (createdDays / runCount));
      const isTrial = r === 0;
      const confirmedAt = ago(day);
      const ttfa = 60 + rand() * 240; // seconds; some miss the 3-minute target
      const status = rand() < 0.06 ? "failed" : rand() < 0.15 ? "partial" : "completed";
      const run = await prisma.adRun.create({
        data: {
          workspaceId: ws.id, userId: user.id, url: `https://${site}`, isTrial, status,
          ratios: isTrial ? ["1:1"] : ["4:5", "1:1", "9:16"],
          creditsReserved: isTrial ? 0 : 15, confirmedAt, createdAt: new Date(confirmedAt.getTime() - 40_000),
          firstAdAt: status === "failed" ? null : new Date(confirmedAt.getTime() + ttfa * 1000),
          completedAt: new Date(confirmedAt.getTime() + (ttfa + 300) * 1000),
          error: status === "failed" ? "render_static: provider timeout" : null,
        },
      });
      counts.runs++;
      if (!isTrial) {
        ledger.push({ delta: -15, reason: "reserve", createdAt: confirmedAt, runId: run.id, stripeRef: `reserve:${run.id}` });
        if (status !== "completed") ledger.push({ delta: 3, reason: "release", createdAt: new Date(confirmedAt.getTime() + 600_000), runId: run.id, note: `release:${run.id}:seed` });
      }
      const adRows = Array.from({ length: 5 }, (_, k) => ({
        runId: run.id, workspaceId: ws.id, index: k, awareness: pick(["problem_aware", "solution_aware", "product_aware"] as const),
        angle: "Seed angle", hook: "Seed hook", headline: `Seed headline ${k + 1}`,
        status: rand() < 0.88 ? ("ready" as const) : ("failed_qc" as const),
        costMicros: BigInt(Math.round(40_000 + rand() * 120_000)), createdAt: confirmedAt,
      }));
      await prisma.ad.createMany({ data: adRows });
      counts.ads += adRows.length;
      events.push({ name: "run_confirmed", createdAt: confirmedAt }, { name: "first_ad_ready", createdAt: new Date(confirmedAt.getTime() + ttfa * 1000) });
      if (status === "failed" || rand() < 0.08) {
        await prisma.adJob.create({
          data: {
            type: pick(["render_static", "render_motion", "qc", "extract"]), runId: run.id, workspaceId: ws.id,
            status: rand() < 0.7 ? "dead" : "failed", attempts: 3, maxAttempts: 3,
            lastError: pick(["Provider timeout after 120s", "QC rejected 3 times: text overflow", "Fetch failed: 403 Forbidden", "Codex login expired"]),
            createdAt: confirmedAt, finishedAt: new Date(confirmedAt.getTime() + 300_000),
          },
        });
        counts.jobs++;
      }
    }

    ledger.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (const l of ledger) {
      const delta = Math.max(l.delta, -balance); // never negative
      balance += delta;
      await prisma.creditLedger.create({ data: { workspaceId: ws.id, ...l, delta, balanceAfter: balance } });
      counts.ledger++;
    }
    await prisma.adsWorkspace.update({ where: { id: ws.id }, data: { creditBalance: balance } });
    await prisma.adsEvent.createMany({ data: events.map((e) => ({ ...e, workspaceId: ws.id, userId: user.id, props: e.props ?? {} })) });
    counts.events += events.length;

    if (rand() < 0.25 || i === 7) {
      const kind = pick(["trial_farming", "disposable_email", "rate_limit", "blocked_content", "payment_fraud"]);
      await prisma.abuseFlag.create({
        data: { workspaceId: ws.id, userId: user.id, kind, severity: i === 7 ? "high" : pick(["low", "medium", "high"]), details: { seeded: true, site }, createdAt: ago(rand() * 10) },
      });
      counts.flags++;
    }
  }

  const beats = [
    { id: "provider:codex", kind: "provider", ok: false, message: "Codex login expired: run `codex login` on the engine" },
    { id: "seed-worker-1", kind: "worker", ok: true, message: "idle" },
    { id: "seed-worker-2", kind: "worker", ok: true, message: "render_static run_x" },
  ];
  for (const b of beats) await prisma.engineHeartbeat.upsert({ where: { id: b.id }, create: b, update: b });
  for (const key of ["ezmotion", "meta_publish"]) await prisma.adsFeatureFlag.upsert({ where: { key }, create: { key, enabled: key === "ezmotion" }, update: {} });

  console.log("Seeded:", counts);
  console.log(`Admin login: ${ADMIN_EMAIL} / ${password}  (user id ${admin.id}; password reset on every seed run)`);
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
