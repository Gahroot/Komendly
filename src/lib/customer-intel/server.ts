// DB glue for customer memory. Structural Db type so web (Prisma) and engine (its own Prisma client) share it.
// Storage: AdsEvent name "customer_memory" (latest wins: one row per workspace+brand, updated in place) and
// "customer_learned" (weekly record, one row per workspace+brand+week). No schema changes.
import { buildMemory, formatPromptContext, MEMORY_EVENT, parseMemory, type CustomerMemory, type Feedback, type MemoryInputs } from "./memory";
import { leadsWithOffer, weeklyLearned, isKept, type AdSignal, type WeeklyLearned } from "./learning";
import { weekKey } from "./agency";

export const LEARNED_EVENT = "customer_learned";
export const MEMORY_FLAG = "sys_customer_memory";
const DAY = 86_400_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type IntelDb = any; // PrismaClient from web or engine (both generated from the same schema)

export async function memoryEnabled(db: IntelDb): Promise<boolean> {
  try {
    return Boolean((await db.adsFeatureFlag.findUnique({ where: { key: MEMORY_FLAG } }))?.enabled);
  } catch {
    return false;
  }
}

/** Latest memory for a workspace (optionally one brand). Only ever reads rows of this workspaceId. */
export async function getCustomerMemory(db: IntelDb, workspaceId: string, brandId?: string | null): Promise<CustomerMemory | null> {
  const row = await db.adsEvent.findFirst({
    where: { name: MEMORY_EVENT, workspaceId, ...(brandId ? { props: { path: ["brandId"], equals: brandId } } : {}) },
    orderBy: { createdAt: "desc" },
    select: { props: true },
  });
  const m = parseMemory((row?.props as { memory?: unknown } | null)?.memory);
  return m && m.workspaceId === workspaceId ? m : null; // belt and braces: never return another workspace's memory
}

export async function saveCustomerMemory(db: IntelDb, m: CustomerMemory): Promise<void> {
  const existing = await db.adsEvent.findFirst({
    where: { name: MEMORY_EVENT, workspaceId: m.workspaceId, props: { path: ["brandId"], equals: m.brandId } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const props = { brandId: m.brandId, version: m.version, memory: m };
  if (existing) await db.adsEvent.update({ where: { id: existing.id }, data: { props, createdAt: new Date() } });
  else await db.adsEvent.create({ data: { name: MEMORY_EVENT, workspaceId: m.workspaceId, props } });
}

/** Deletion: remove every memory and weekly-learned record of a workspace. Call on account/data deletion or customer request. */
export async function purgeCustomerMemory(db: IntelDb, workspaceId: string): Promise<number> {
  const r = await db.adsEvent.deleteMany({ where: { workspaceId, name: { in: [MEMORY_EVENT, LEARNED_EVENT] } } });
  return r.count as number;
}

/** Collect inputs from this workspace's own rows (90 days). */
export async function assembleInputs(db: IntelDb, workspaceId: string, brandId: string | null, now: Date): Promise<MemoryInputs & { runIds: string[] }> {
  const since = new Date(now.getTime() - 90 * DAY);
  const brand = brandId ? await db.brandProfile.findFirst({ where: { id: brandId, workspaceId } }) : await db.brandProfile.findFirst({ where: { workspaceId }, orderBy: { updatedAt: "desc" } });
  const bid: string | null = brand?.id ?? null;
  const runs = await db.adRun.findMany({ where: { workspaceId, ...(bid ? { brandProfileId: bid } : {}), createdAt: { gte: since }, kind: { notIn: ["gift", "nurture"] } }, select: { id: true }, take: 60 });
  const runIds: string[] = runs.map((r: { id: string }) => r.id);
  const ads: any[] = runIds.length ? await db.ad.findMany({ where: { workspaceId, runId: { in: runIds }, kind: "static" }, select: { id: true, headline: true, body: true, awareness: true, status: true, assets: { select: { id: true } }, publishes: { select: { status: true } } }, take: 400 }) : [];
  const downloads: any[] = await db.adsEvent.findMany({ where: { workspaceId, name: "export_downloaded", createdAt: { gte: since } }, select: { props: true }, take: 2000 });
  const downloadedAssets = new Set(downloads.map((d) => (d.props as { assetId?: string })?.assetId).filter((x): x is string => typeof x === "string"));
  const approvals: any[] = runIds.length ? await db.adsEvent.findMany({ where: { name: "ad_approval", runId: { in: runIds } }, orderBy: { createdAt: "asc" }, select: { runId: true, createdAt: true, props: true } }) : [];
  const feedback: Feedback[] = approvals.map((a) => ({ action: (a.props as any)?.action === "approve" ? "approve" : "changes", note: typeof (a.props as any)?.note === "string" ? (a.props as any).note : null, runId: a.runId ?? undefined, at: a.createdAt.toISOString() }));
  const signals: AdSignal[] = ads
    .filter((a) => a.status === "ready" || a.status === "failed_qc")
    .map((a) => ({
      headline: String(a.headline ?? ""), awareness: a.awareness, hasOffer: leadsWithOffer(String(a.headline ?? ""), a.body),
      usesPhoto: null, // not recorded per ad today; guidance on photos stays off until it is
      downloaded: a.assets.some((x: { id: string }) => downloadedAssets.has(x.id)),
      published: a.publishes.some((p: { status: string }) => p.status === "published"),
      rejected: a.status === "failed_qc",
    }));
  const b = brand as any;
  const hex = (Array.isArray(b?.colors) ? b.colors : []).map((c: any) => (typeof c?.hex === "string" ? c.hex : "")).filter(Boolean);
  const claims = (Array.isArray(b?.facts) ? b.facts : []).map((f: any) => (typeof f?.claim === "string" ? f.claim : "")).filter(Boolean);
  const trade = (await db.adsEvent.findFirst({ where: { workspaceId, name: "trade_tagged" }, orderBy: { createdAt: "asc" }, select: { props: true } }))?.props as { trade?: string } | null;
  return {
    workspaceId, brandId: bid, now, runIds, ads: signals, feedback, trade: trade?.trade ?? null,
    brand: b ? { name: b.name, domain: b.domain, audience: b.audience, mainOffer: b.mainOffer, voice: b.voice, landingPage: b.landingPage, colors: hex, claims, editedFields: Object.keys(b.userEdited ?? {}), sourceUrl: b.url } : null,
  };
}

/** Rebuild + save the memory for a workspace/brand. Respects the flag unless `force`. */
export async function refreshCustomerMemory(db: IntelDb, workspaceId: string, brandId: string | null, now = new Date(), opts: { force?: boolean; performance?: MemoryInputs["performance"] } = {}): Promise<CustomerMemory | null> {
  if (!opts.force && !(await memoryEnabled(db))) return null;
  const inputs = await assembleInputs(db, workspaceId, brandId, now);
  const prev = await getCustomerMemory(db, workspaceId, inputs.brandId);
  const m = buildMemory({ ...inputs, performance: opts.performance }, prev);
  await saveCustomerMemory(db, m);
  return m;
}

/** Prompt block for the generator: "" when the flag is off, nothing is known, or anything fails. Never throws. */
export async function customerMemoryPrompt(db: IntelDb, workspaceId: string, brandId: string | null): Promise<string> {
  try {
    if (!(await memoryEnabled(db))) return "";
    return formatPromptContext(await getCustomerMemory(db, workspaceId, brandId));
  } catch {
    return "";
  }
}

/** Weekly "what we learned about your business" record (one per workspace+brand+ISO week; idempotent). Measured facts only. */
export async function recordWeeklyLearned(db: IntelDb, workspaceId: string, brandId: string | null, now = new Date(), performance?: { spendUsd: number; leads: number; days: number } | null): Promise<WeeklyLearned | null> {
  const week = weekKey(now);
  const done = await db.adsEvent.findFirst({ where: { name: LEARNED_EVENT, workspaceId, AND: [{ props: { path: ["week"], equals: week } }, { props: { path: ["brandId"], equals: brandId } }] }, select: { props: true } });
  if (done) return (done.props as { learned?: WeeklyLearned }).learned ?? null;
  const inputs = await assembleInputs(db, workspaceId, brandId, now);
  const m = buildMemory(inputs, await getCustomerMemory(db, workspaceId, inputs.brandId));
  const ads = inputs.ads ?? [];
  const learned = weeklyLearned({
    guidance: m.guidance, sampleSize: m.sampleSize, made: ads.length, kept: ads.filter(isKept).length, performance,
    approvals: (inputs.feedback ?? []).filter((f) => f.action === "approve").length, changeRequests: (inputs.feedback ?? []).filter((f) => f.action === "changes").length,
  });
  await db.adsEvent.create({ data: { name: LEARNED_EVENT, workspaceId, props: { week, brandId, learned } } });
  return learned;
}
