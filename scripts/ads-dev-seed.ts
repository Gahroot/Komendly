/**
 * Dev seed for Website2ads (/ads).
 * Usage: set -a; . ./.env.local; set +a; npx tsx scripts/ads-dev-seed.ts [email]
 * Creates (or reuses) the user, a workspace, a TidyBooks brand profile, one awaiting_confirm run
 * and one completed trial run (10 static + 1 motion + 1 failed_qc) with assets in the dev bucket.
 * Re-running replaces the seeded runs for the brand; it never changes an existing user's password.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { putObject } from "@/lib/ads/storage";
import { CONFIRM_WINDOW_SECONDS, ExtractionSchema, TRIAL_AWARENESS_MIX, type AdSpec, type Extraction } from "@/lib/ads/contracts";

const PREVIEW_DIR = "/Users/groot/.ezcoder/goals/website2ads/render-preview";
const URL_ROOT = "https://tidybooks.app";
const src = (path: string) => `${URL_ROOT}${path}`;

const extraction: Extraction = ExtractionSchema.parse({
  url: `${URL_ROOT}/`,
  domain: "tidybooks.app",
  brandName: "TidyBooks",
  audience: "Freelancers and solo consultants in the UK who do their own bookkeeping and dread quarter-end.",
  mainOffer: "Bookkeeping that categorises your bank feed for you, so your VAT return is ready in 10 minutes. 14-day free trial.",
  pains: [
    { text: "Sunday evenings lost to sorting receipts into a spreadsheet", sourceUrl: src("/"), quote: "No more Sunday nights with a shoebox of receipts." },
    { text: "Not knowing what you owe HMRC until it's too late", sourceUrl: src("/features/tax"), quote: "Always know what to set aside for tax." },
    { text: "Chasing clients for unpaid invoices", sourceUrl: src("/features/invoicing"), quote: "Automatic reminders, so you never have to ask twice." },
    { text: "Paying an accountant to fix a messy year of books", sourceUrl: src("/pricing") },
    { text: "Missing receipts when the VAT return is due", sourceUrl: src("/features/receipts"), quote: "Snap it, forget it." },
  ],
  proof: [
    { text: "“I used to lose a weekend every quarter. Now it's a coffee break.” — Priya S., UX consultant", sourceUrl: src("/customers"), kind: "testimonial" },
    { text: "4.8/5 from 1,200+ reviews", sourceUrl: src("/"), kind: "stat" },
    { text: "HMRC-recognised for Making Tax Digital", sourceUrl: src("/features/tax"), kind: "award" },
  ],
  facts: [
    { claim: "Bank transactions are categorised automatically", sourceUrl: src("/features"), quote: "TidyBooks sorts every transaction as it lands." },
    { claim: "VAT returns can be filed directly to HMRC", sourceUrl: src("/features/tax"), quote: "File your VAT return to HMRC in a few clicks." },
    { claim: "14-day free trial, no card required", sourceUrl: src("/pricing"), quote: "Try it free for 14 days. No card needed." },
    { claim: "Plans start at £9 per month", sourceUrl: src("/pricing"), quote: "From £9/month." },
    { claim: "Rated 4.8 out of 5 by over 1,200 reviewers", sourceUrl: src("/"), quote: "4.8/5 from 1,200+ reviews" },
  ],
  landingPage: src("/signup"),
  suggestedGoal: "leads",
  voice: "Warm, plain-spoken, a little dry. Talks like a friend who happens to be good with numbers.",
  colors: [
    { hex: "#1F7A5C", role: "primary" },
    { hex: "#F2B84B", role: "accent" },
    { hex: "#FAF7F2", role: "bg" },
    { hex: "#1B1F23", role: "text" },
  ],
  fonts: [
    { family: "Fraunces", role: "heading", sourceUrl: "https://fonts.google.com/specimen/Fraunces" },
    { family: "Inter", role: "body", sourceUrl: "https://fonts.google.com/specimen/Inter" },
  ],
  logoKey: null,
  assets: [],
});

type Spec = Pick<AdSpec, "awareness" | "angle" | "hook" | "headline" | "body" | "cta" | "claims">;
const PRICING = src("/pricing");
const statics: Spec[] = [
  { awareness: "problem_aware", angle: "Sunday-night receipt sorting", hook: "It's 9pm on Sunday and I'm still matching receipts to my bank statement.", headline: "Get your Sunday nights back", body: "TidyBooks sorts every transaction as it lands, so there's nothing left to match.", cta: "Try free", claims: [{ claim: "Bank transactions are categorised automatically", sourceUrl: src("/features") }] },
  { awareness: "problem_aware", angle: "Fear of the tax bill", hook: "I genuinely have no idea how much I owe HMRC this year.", headline: "Know what to set aside, every month", body: "See your tax estimate update as you get paid.", cta: "Start free", claims: [] },
  { awareness: "problem_aware", angle: "Chasing late invoices", hook: "Do I really have to email this client a third time about that invoice?", headline: "Let the reminders do the chasing", body: "Automatic, polite follow-ups on unpaid invoices.", cta: "Try free", claims: [] },
  { awareness: "problem_aware", angle: "The shoebox of receipts", hook: "There's a carrier bag of crumpled receipts in my desk drawer.", headline: "Snap it. Forget it.", body: "Photograph receipts on the go; they're matched for you.", cta: "Try free", claims: [] },
  { awareness: "problem_aware", angle: "Accountant clean-up bill", hook: "My accountant charged me £600 just to untangle last year's books.", headline: "Clean books all year, not just in January", body: "Stay tidy as you go, from £9 a month.", cta: "See pricing", claims: [{ claim: "Plans start at £9 per month", sourceUrl: PRICING }] },
  { awareness: "problem_aware", angle: "VAT deadline panic", hook: "The VAT return is due Friday and I haven't even opened the spreadsheet.", headline: "Your VAT return, ready in minutes", body: "File straight to HMRC from TidyBooks.", cta: "Try free", claims: [{ claim: "VAT returns can be filed directly to HMRC", sourceUrl: src("/features/tax") }] },
  { awareness: "problem_aware", angle: "Spreadsheet formula broke", hook: "I typed one number in the wrong cell and now nothing adds up.", headline: "Ditch the fragile spreadsheet", body: "Totals that are always right, without formulas.", cta: "Start free", claims: [] },
  { awareness: "solution_aware", angle: "Tried apps that still need manual tagging", hook: "I've tried bookkeeping apps. I still ended up tagging everything by hand.", headline: "The app that actually sorts it for you", body: "Every transaction categorised as it lands.", cta: "Try free", claims: [{ claim: "Bank transactions are categorised automatically", sourceUrl: src("/features") }] },
  { awareness: "solution_aware", angle: "Big accounting suites are overkill", hook: "Why am I paying for payroll and inventory when it's just me?", headline: "Built for one-person businesses", body: "Just the bookkeeping a freelancer needs, from £9/month.", cta: "See pricing", claims: [{ claim: "Plans start at £9 per month", sourceUrl: PRICING }] },
  { awareness: "solution_aware", angle: "Social proof from peers", hook: "Every other freelancer I know seems to have their books sorted. How?", headline: "Rated 4.8/5 by 1,200+ freelancers", body: "Try it free for 14 days. No card needed.", cta: "Try free", claims: [{ claim: "Rated 4.8 out of 5 by over 1,200 reviewers", sourceUrl: src("/") }, { claim: "14-day free trial, no card required", sourceUrl: PRICING }] },
];
const motion: Spec = { awareness: "problem_aware", angle: "Quarter-end weekend vs coffee break", hook: "I used to lose a whole weekend every quarter.", headline: "Quarter-end in a coffee break", body: "Transactions sorted as they land. VAT filed in a few clicks.", cta: "Try free", claims: [{ claim: "VAT returns can be filed directly to HMRC", sourceUrl: src("/features/tax") }] };
const rejected: Spec = { awareness: "solution_aware", angle: "Fastest bookkeeping app", hook: "I just want the quickest option.", headline: "The UK's fastest bookkeeping app", body: "Unsourced superlative: rejected by QC.", cta: "Try free", claims: [{ claim: "The UK's fastest bookkeeping app", sourceUrl: src("/") }] };

function argEmail(): string {
  return (process.argv[2] ?? "dev@komendly.dev").trim().toLowerCase();
}

async function upload(key: string, file: string, mime: string): Promise<number> {
  await putObject(key, readFileSync(file), mime);
  return statSync(file).size;
}

function makeMotionMp4(png: string): string {
  const out = join(mkdtempSync(join(tmpdir(), "ads-seed-")), "motion.mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", png, "-t", "4", "-vf", "zoompan=z='min(zoom+0.0015,1.15)':d=100:s=1080x1080,format=yuv420p", "-r", "25", "-c:v", "libx264", out]);
  return out;
}

async function main(): Promise<void> {
  const email = argEmail();
  let user = await prisma.user.findUnique({ where: { email } });
  let password: string | null = null;
  if (!user) {
    password = `ads-${randomBytes(6).toString("hex")}`;
    user = await prisma.user.create({ data: { email, name: "Dev Tester", passwordHash: await hashPassword(password), emailVerifiedAt: new Date() } });
  } else if (!user.emailVerifiedAt) {
    user = await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  }

  const membership = await prisma.adsWorkspaceMember.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, include: { workspace: true } });
  const workspace =
    membership?.workspace ??
    (await prisma.adsWorkspace.create({ data: { name: "Dev Tester's workspace", ownerId: user.id, members: { create: { userId: user.id, role: "owner" } } } }));

  const logoKey = `ws/${workspace.id}/brands/tidybooks.app/logo.png`;
  await upload(logoKey, join(PREVIEW_DIR, "_assets/tidybooks-logo.png"), "image/png");
  const brandFields = {
    url: extraction.url,
    name: extraction.brandName,
    colors: extraction.colors,
    fonts: extraction.fonts,
    logoKey,
    audience: extraction.audience,
    mainOffer: extraction.mainOffer,
    pains: extraction.pains,
    proof: extraction.proof,
    facts: extraction.facts,
    landingPage: extraction.landingPage,
    voice: extraction.voice,
  } satisfies Prisma.BrandProfileUncheckedUpdateInput;
  const brand = await prisma.brandProfile.upsert({
    where: { workspaceId_domain: { workspaceId: workspace.id, domain: extraction.domain } },
    create: { workspaceId: workspace.id, domain: extraction.domain, ...brandFields },
    update: { ...brandFields, userEdited: {} },
  });
  await prisma.adRun.deleteMany({ where: { workspaceId: workspace.id, brandProfileId: brand.id } });

  const now = Date.now();
  const snapshot = { ...extraction, logoKey } satisfies Extraction;
  const pending = await prisma.adRun.create({
    data: {
      workspaceId: workspace.id, userId: user.id, brandProfileId: brand.id, url: extraction.url, status: "awaiting_confirm",
      extractAttempts: 1, extraction: snapshot, awarenessMix: TRIAL_AWARENESS_MIX, ratios: ["1:1"],
      confirmDeadline: new Date(now + CONFIRM_WINDOW_SECONDS * 1000), createdAt: new Date(now - 5_000),
    },
  });

  const started = new Date(now - 2 * 86_400_000);
  const done = await prisma.adRun.create({
    data: {
      workspaceId: workspace.id, userId: user.id, brandProfileId: brand.id, url: extraction.url, status: "completed", isTrial: true,
      extractAttempts: 1, extraction: snapshot, awarenessMix: TRIAL_AWARENESS_MIX, ratios: ["1:1"], goal: "auto", resolvedGoal: "leads",
      confirmDeadline: new Date(started.getTime() + 30_000), confirmedAt: new Date(started.getTime() + 12_000),
      firstAdAt: new Date(started.getTime() + 95_000), completedAt: new Date(started.getTime() + 420_000), createdAt: started,
    },
  });

  const all: { spec: Spec; kind: "static" | "motion"; status: "ready" | "failed_qc" }[] = [
    ...statics.map((spec) => ({ spec, kind: "static" as const, status: "ready" as const })),
    { spec: motion, kind: "motion", status: "ready" },
    { spec: rejected, kind: "static", status: "failed_qc" },
  ];
  for (const [index, item] of all.entries()) {
    const { spec } = item;
    const ad = await prisma.ad.create({
      data: {
        runId: done.id, workspaceId: workspace.id, kind: item.kind, index, awareness: spec.awareness, angle: spec.angle, hook: spec.hook,
        headline: spec.headline, body: spec.body, cta: spec.cta, claims: spec.claims, status: item.status, qcAttempts: item.status === "failed_qc" ? 2 : 1,
        visualBrief: { concept: spec.angle, assetKeys: [], layout: "headline-top", generateImagery: false },
        qcReport: item.status === "failed_qc"
          ? { pass: false, checks: [{ name: "claims_sourced", pass: false, detail: "“fastest” has no supporting fact on the site." }] }
          : { pass: true, checks: [{ name: "claims_sourced", pass: true, detail: "All claims map to brand facts." }] },
      },
    });
    if (item.status !== "ready") continue;
    const png = join(PREVIEW_DIR, "light-tidybooks", `ad-${index}-1x1.png`);
    const isMotion = item.kind === "motion";
    const file = isMotion ? makeMotionMp4(png) : png;
    const mime = isMotion ? "video/mp4" : "image/png";
    const key = `ws/${workspace.id}/runs/${done.id}/ad-${index}-1x1.${isMotion ? "mp4" : "png"}`;
    const bytes = await upload(key, file, mime);
    await prisma.adAsset.create({ data: { adId: ad.id, ratio: "1:1", storageKey: key, mime, width: 1080, height: 1080, bytes, expiresAt: new Date(now + 30 * 86_400_000) } });
  }
  await prisma.adsWorkspace.update({ where: { id: workspace.id }, data: { trialUsedAt: workspace.trialUsedAt ?? started } });

  console.log(JSON.stringify({
    login: { url: "/ads/login", email, password: password ?? "(existing user: password unchanged)" },
    workspaceId: workspace.id, brandProfileId: brand.id, awaitingConfirmRunId: pending.id, completedRunId: done.id, ads: all.length,
  }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
