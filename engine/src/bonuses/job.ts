// bonus_generate job: builds one Ozzy Ad Department bonus (payload.kind) for job.workspaceId and stores it in AdsBonus.
// Only for live Ad Department workspaces. Output is zod-validated (contracts.ts); data keeps the last good version on failure.
import type { Prisma } from "@prisma/client";
import { hasAdDepartment } from "../../../src/lib/ads/billing-config";
import { parseBonus } from "../../../src/lib/ads/bonus-access";
import {
  BonusPayloadSchema, bonusesEnabled, bonusJsonSchema, checkBonusOutput, unknownPlanAds,
  type AdsBonusKind, type AdPlan, type HookLibrary, type WebsiteCheckup,
} from "../../../src/lib/ads/bonuses/contracts";
import type { Db } from "../db";
import { JobAbortedError } from "../jobs/abort";
import { PermanentJobError, type JobContext } from "../jobs/context";
import { crawlSite, guardRoute } from "../jobs/extract/crawl";
import { assertPublicUrl } from "../net/ssrf";
import { log } from "../log";
import { ProviderUnavailableError } from "../providers/errors";
import type { AIProvider, TextRequest, UsageMeter } from "../providers/types";
import { adPlanPrompt, checkupPrompt, hookLibraryPrompt, OZZY_SYSTEM, type BrandBrief, type PlanAd } from "./prompts";

const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

/** Structured call validated with the shared (web-app zod) bonus schemas; one repair attempt. */
async function bonusStructured(provider: AIProvider, kind: "website_checkup", req: Omit<TextRequest, "jsonSchema">, usage: UsageMeter[]): Promise<WebsiteCheckup>;
async function bonusStructured(provider: AIProvider, kind: "ad_plan", req: Omit<TextRequest, "jsonSchema">, usage: UsageMeter[]): Promise<AdPlan>;
async function bonusStructured(provider: AIProvider, kind: "hook_library", req: Omit<TextRequest, "jsonSchema">, usage: UsageMeter[]): Promise<HookLibrary>;
async function bonusStructured(provider: AIProvider, kind: AdsBonusKind, req: Omit<TextRequest, "jsonSchema">, usage: UsageMeter[]): Promise<unknown> {
  const jsonSchema = bonusJsonSchema(kind);
  let prompt = req.prompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await provider.text({ ...req, prompt, jsonSchema });
    usage.push(r.usage);
    const c = checkBonusOutput(kind, r.json);
    if (c.ok) return c.data;
    prompt = `${req.prompt}\n\nYour previous answer did not match the schema: ${c.error}\nReturn corrected JSON only.`;
  }
  throw new Error(`${kind}: model output did not match schema after repair`);
}

function texts(raw: unknown, key: string): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>)[key] : x))
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .slice(0, 20);
}

type BrandRow = { id: string; url: string; name: string | null; audience: string | null; mainOffer: string | null; voice: string | null; pains: unknown; proof: unknown; facts: unknown };

export function briefFromBrand(b: BrandRow): BrandBrief {
  return { name: b.name, url: b.url, audience: b.audience, mainOffer: b.mainOffer, voice: b.voice, pains: texts(b.pains, "text"), proof: texts(b.proof, "text"), facts: texts(b.facts, "claim") };
}

export async function latestBrand(db: Db, workspaceId: string): Promise<BrandRow | null> {
  // The member's OWN brand: brand profiles that only gift packs used (a friend's or a prospect's site) don't count.
  return db.brandProfile.findFirst({
    where: { workspaceId, runs: { some: { kind: { notIn: ["gift"] } } } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, url: true, name: true, audience: true, mainOffer: true, voice: true, pains: true, proof: true, facts: true },
  });
}

/** Ready ads the member can run (bonus/locked ads and gift packs excluded), newest first. */
export async function planAds(db: Db, workspaceId: string): Promise<PlanAd[]> {
  const ads = await db.ad.findMany({
    where: { workspaceId, status: "ready", run: { kind: { notIn: ["gift", "nurture"] } } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, headline: true, hook: true, body: true, angle: true, awareness: true, createdAt: true, visualBrief: true },
  });
  return ads.filter((a) => !parseBonus(a.visualBrief)).slice(0, 24).map((a) => ({ id: a.id, headline: a.headline, hook: a.hook, body: a.body, angle: a.angle, awareness: a.awareness, createdAt: a.createdAt.toISOString() }));
}

/** Phone-sized load of the homepage through the SSRF guard: load time + screenshot. Null when it can't load. */
async function mobileCheck(ctx: JobContext, url: string): Promise<{ loadMs: number; ok: boolean; shot: Buffer } | null> {
  try {
    await assertPublicUrl(url);
    const browser = await ctx.shared.renderBrowser();
    const bctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: MOBILE_UA, serviceWorkers: "block", acceptDownloads: false });
    try {
      await bctx.route("**/*", guardRoute);
      const page = await bctx.newPage();
      const t0 = Date.now();
      const ok = await page.goto(url, { waitUntil: "load", timeout: 25_000 }).then(() => true, () => false);
      const loadMs = Date.now() - t0;
      await page.waitForTimeout(800);
      const shot = await page.screenshot({ type: "jpeg", quality: 60 });
      return { loadMs, ok, shot };
    } finally {
      await bctx.close().catch(() => undefined);
    }
  } catch (e) {
    log("warn", "bonus mobile check failed", { error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    return null;
  }
}

async function generateCheckup(ctx: JobContext, brand: BrandRow, usage: UsageMeter[]) {
  const crawl = await crawlSite(brand.url, { maxPages: 3, pageTimeoutMs: 10_000, totalTimeoutMs: 30_000, maxImages: 0, maxImageBytes: 1, maxTextChars: 8_000 }, ctx.signal);
  const mobile = await mobileCheck(ctx, crawl.finalUrl);
  const images: Array<{ mediaType: string; base64: string }> = [];
  const labels: string[] = [];
  const desktop = crawl.pages[0]?.screenshot;
  if (desktop) {
    images.push({ mediaType: "image/jpeg", base64: desktop.toString("base64") });
    labels.push("image 1 = homepage on a laptop screen (top of page)");
  }
  if (mobile) {
    images.push({ mediaType: "image/jpeg", base64: mobile.shot.toString("base64") });
    labels.push(`image ${images.length} = homepage on a phone (top of page)`);
  }
  const prompt = checkupPrompt({ brand: briefFromBrand(brand), pages: crawl.pages.map((p) => ({ url: p.url, title: p.title, text: p.text })), mobile: mobile ? { loadMs: mobile.loadMs, ok: mobile.ok } : null, screenshots: labels.length ? labels : ["none"] });
  const out = await bonusStructured(ctx.provider, "website_checkup", { system: OZZY_SYSTEM, prompt, images, reasoning: "high", signal: ctx.signal }, usage);
  return { ...out, checkedUrl: crawl.finalUrl, phoneLoadSeconds: mobile ? Math.round(mobile.loadMs / 100) / 10 : null };
}

export async function generateAdPlan(provider: AIProvider, brand: BrandBrief, ads: PlanAd[], now: Date, usage: UsageMeter[], signal?: AbortSignal) {
  if (ads.length === 0) throw new PermanentJobError("no ready ads for the plan");
  const month = now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const base = adPlanPrompt({ brand, ads, month });
  let prompt = base;
  for (let attempt = 0; attempt < 2; attempt++) {
    const plan = await bonusStructured(provider, "ad_plan", { system: OZZY_SYSTEM, prompt, reasoning: "high", signal }, usage);
    const bad = unknownPlanAds(plan, ads.map((a) => a.id));
    if (bad.length === 0) {
      const byId = new Map(ads.map((a) => [a.id, a]));
      return { ...plan, weeks: plan.weeks.map((w) => ({ ...w, adHeadline: byId.get(w.adId)?.headline ?? w.adHeadline })), adIds: ads.map((a) => a.id), startsOn: now.toISOString().slice(0, 10) };
    }
    prompt = `${base}\n\nThese adId values are not in the list: ${bad.join(", ")}. Use only ids from the list.`;
  }
  throw new Error("ad plan used unknown ad ids");
}

export async function generateHookLibrary(provider: AIProvider, brand: BrandBrief, usage: UsageMeter[], signal?: AbortSignal) {
  return bonusStructured(provider, "hook_library", { system: OZZY_SYSTEM, prompt: hookLibraryPrompt({ brand }), reasoning: "high", signal }, usage);
}

async function generate(ctx: JobContext, kind: AdsBonusKind, workspaceId: string, brand: BrandRow, usage: UsageMeter[]): Promise<Record<string, unknown>> {
  if (kind === "website_checkup") return generateCheckup(ctx, brand, usage);
  if (kind === "ad_plan") return generateAdPlan(ctx.provider, briefFromBrand(brand), await planAds(ctx.db, workspaceId), ctx.now(), usage, ctx.signal);
  return generateHookLibrary(ctx.provider, briefFromBrand(brand), usage, ctx.signal);
}

export async function bonusGenerateJob(ctx: JobContext): Promise<unknown> {
  const { db, job } = ctx;
  const p = BonusPayloadSchema.safeParse(job.payload);
  if (!p.success || !job.workspaceId) throw new PermanentJobError("bonus_generate needs workspaceId and a valid kind");
  const { kind } = p.data;
  const workspaceId = job.workspaceId;
  const where = { workspaceId_kind: { workspaceId, kind } };
  if (!bonusesEnabled(process.env)) return { skipped: "disabled" };
  const ws = await db.adsWorkspace.findUnique({ where: { id: workspaceId }, select: { adsPlan: true, subscriptionStatus: true, suspendedAt: true, ownerId: true } });
  if (!ws || !hasAdDepartment(ws)) {
    await db.adsBonus.updateMany({ where: { workspaceId, kind, status: { in: ["pending", "generating"] } }, data: { status: "failed", error: "not an Ad Department workspace" } });
    return { skipped: "not_member" };
  }
  const brand = await latestBrand(db, workspaceId);
  if (!brand) {
    await db.adsBonus.updateMany({ where: { workspaceId, kind, status: { in: ["pending", "generating"] } }, data: { status: "failed", error: "no brand profile" } });
    return { skipped: "no_brand" };
  }
  await db.adsBonus.upsert({ where, create: { workspaceId, kind, status: "generating", reason: p.data.reason ?? null }, update: { status: "generating", error: null } });
  const usage: UsageMeter[] = [];
  try {
    const data = await generate(ctx, kind, workspaceId, brand, usage);
    const cost = usage.reduce((a, u) => a + u.costMicros, 0);
    ctx.usage.push(...usage);
    const row = await db.adsBonus.update({
      where,
      data: { status: "ready", data: data as Prisma.InputJsonValue, brandProfileId: brand.id, error: null, generatedAt: ctx.now(), version: { increment: 1 }, costMicros: { increment: BigInt(Math.round(cost)) } },
    });
    await db.adsEvent.create({ data: { name: "bonus_ready", workspaceId, userId: ws.ownerId, props: { program: "ad_department", kind, version: row.version, reason: p.data.reason ?? null } } });
    return { kind, version: row.version };
  } catch (e) {
    ctx.usage.push(...usage);
    const retryable = e instanceof ProviderUnavailableError || e instanceof JobAbortedError;
    const msg = e instanceof Error ? e.message.slice(0, 500) : String(e);
    await db.adsBonus.update({ where, data: { status: retryable ? "pending" : "failed", error: msg } }).catch(() => undefined);
    throw e;
  }
}
