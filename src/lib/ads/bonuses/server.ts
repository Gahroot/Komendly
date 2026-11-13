// Ozzy Ad Department bonuses, web side: view models, member re-runs, "Make an ad from this hook".
// Generation itself runs in the engine (bonus_generate job); this only reads AdsBonus and enqueues jobs.
import type { AdsWorkspace, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RequestFingerprint } from "../abuse";
import { hasAdDepartment } from "../billing-config";
import { trackAdsEvent } from "../events";
import { startRun } from "../run-start";
import { AdsHttpError } from "../workspace";
import {
  BONUS_JOB_TYPE, BONUS_KINDS, BONUS_META, bonusDue, bonusesEnabled, checkupRerunOpensAt, parseBonusData,
  type AdsBonusKind, type BonusRowState,
} from "./contracts";

const PRIORITY = 5;

export type BonusCardStatus = "ready" | "working" | "needs_ads" | "needs_site";

export interface BonusCard {
  kind: AdsBonusKind;
  title: string;
  valueUsd: number;
  blurb: string;
  status: BonusCardStatus;
  generatedAt: string | null;
}

export interface AdDepartmentView {
  member: boolean;
  cards: BonusCard[];
}

type WsFields = Pick<AdsWorkspace, "id" | "adsPlan" | "subscriptionStatus" | "suspendedAt">;

async function enqueueBonus(workspaceId: string, kind: AdsBonusKind, reason: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`bonus:${workspaceId}:${kind}`}))`;
    const open = await tx.adJob.findFirst({
      where: { type: BONUS_JOB_TYPE, workspaceId, status: { in: ["queued", "running"] }, payload: { path: ["kind"], equals: kind } },
      select: { id: true },
    });
    if (open) return false;
    await tx.adsBonus.upsert({
      where: { workspaceId_kind: { workspaceId, kind } },
      create: { workspaceId, kind, status: "pending", reason },
      update: { status: "pending", reason, error: null },
    });
    await tx.adJob.create({ data: { type: BONUS_JOB_TYPE, workspaceId, payload: { kind, reason }, priority: PRIORITY, maxAttempts: 3 } });
    return true;
  });
}

function cardStatus(row: (BonusRowState & { data: unknown }) | null, kind: AdsBonusKind, hasBrand: boolean, adCount: number): BonusCardStatus {
  if (row && parseBonusData(kind, row.data)) return "ready"; // a failed refresh keeps showing the last good version
  if (!hasBrand) return "needs_site";
  if (kind === "ad_plan" && adCount === 0) return "needs_ads";
  return "working";
}

/** The "Your Ad Department" section. Members: also kicks off any bonus that's missing/due (same rules as the engine loop). */
export async function loadAdDepartment(ws: WsFields, now = new Date()): Promise<AdDepartmentView> {
  const member = hasAdDepartment(ws);
  const lockedCards = BONUS_KINDS.map((kind) => ({ kind, ...BONUS_META[kind], status: "working" as const, generatedAt: null }));
  if (!member) return { member, cards: lockedCards };
  const [rows, brand, ads] = await Promise.all([
    prisma.adsBonus.findMany({ where: { workspaceId: ws.id }, select: { kind: true, status: true, generatedAt: true, updatedAt: true, data: true } }),
    prisma.brandProfile.findFirst({ where: { workspaceId: ws.id, runs: { some: { kind: { notIn: ["gift"] } } } }, select: { id: true } }),
    prisma.ad.aggregate({ where: { workspaceId: ws.id, status: "ready", run: { kind: { notIn: ["gift", "nurture"] } } }, _count: { _all: true }, _max: { createdAt: true } }),
  ]);
  const adCount = ads._count._all;
  const cards: BonusCard[] = [];
  for (const kind of BONUS_KINDS) {
    const row = rows.find((r) => r.kind === kind) ?? null;
    if (bonusesEnabled(process.env)) {
      const reason = bonusDue(kind, row, { now, hasBrand: Boolean(brand), readyAdCount: adCount, latestReadyAdAt: ads._max.createdAt });
      if (reason) await enqueueBonus(ws.id, kind, reason).catch(() => false);
    }
    cards.push({ kind, ...BONUS_META[kind], status: cardStatus(row, kind, Boolean(brand), adCount), generatedAt: row?.generatedAt?.toISOString() ?? null });
  }
  return { member, cards };
}

export interface BonusDetail<K extends AdsBonusKind = AdsBonusKind> {
  kind: K;
  data: NonNullable<ReturnType<typeof parseBonusData<K>>> | null;
  working: boolean;
  generatedAt: Date | null;
  version: number;
  /** Check-up only: when the member may re-run it (null = now). */
  rerunOpensAt: Date | null;
}

export async function loadBonusDetail<K extends AdsBonusKind>(ws: WsFields, kind: K, now = new Date()): Promise<BonusDetail<K> | null> {
  if (!hasAdDepartment(ws)) return null;
  const row = await prisma.adsBonus.findUnique({ where: { workspaceId_kind: { workspaceId: ws.id, kind } } });
  const data = row ? parseBonusData(kind, row.data) : null;
  return {
    kind,
    data,
    working: row?.status === "pending" || row?.status === "generating",
    generatedAt: row?.generatedAt ?? null,
    version: row?.version ?? 0,
    rerunOpensAt: kind === "website_checkup" ? checkupRerunOpensAt(row, now) : null,
  };
}

export async function trackBonusViewed(ws: WsFields, userId: string, kind: AdsBonusKind, version: number): Promise<void> {
  await trackAdsEvent("bonus_viewed", { workspaceId: ws.id, userId, props: { program: "ad_department", kind, version } }).catch(() => undefined);
}

/** Member re-run of the website check-up (once a week). */
export async function rerunCheckup(ws: WsFields, now = new Date()): Promise<{ queued: boolean }> {
  if (!hasAdDepartment(ws)) throw new AdsHttpError(403, "not_member", "The website check-up comes with Ozzy Ad Department.");
  if (!bonusesEnabled(process.env)) throw new AdsHttpError(503, "paused", "Ozzy is taking a short break from check-ups. Try again later today.");
  const row = await prisma.adsBonus.findUnique({ where: { workspaceId_kind: { workspaceId: ws.id, kind: "website_checkup" } }, select: { status: true, generatedAt: true, updatedAt: true } });
  if (row && (row.status === "pending" || row.status === "generating")) return { queued: false };
  const opens = checkupRerunOpensAt(row, now);
  if (opens) throw new AdsHttpError(429, "too_soon", `Ozzy can check your site again on ${opens.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}.`);
  return { queued: await enqueueBonus(ws.id, "website_checkup", "rerun") };
}

/** "Make an ad from this hook": a normal run on the member's latest brand, seeded with a hook from their library. */
export async function startHookRun(hook: string, ctx: { user: User; workspace: AdsWorkspace; fp: RequestFingerprint }): Promise<{ runId: string }> {
  const ws = ctx.workspace;
  if (!hasAdDepartment(ws)) throw new AdsHttpError(403, "not_member", "Your hook library comes with Ozzy Ad Department.");
  const row = await prisma.adsBonus.findUnique({ where: { workspaceId_kind: { workspaceId: ws.id, kind: "hook_library" } }, select: { data: true, brandProfileId: true } });
  const lib = row ? parseBonusData("hook_library", row.data) : null;
  const picked = lib?.hooks.find((h) => h.text === hook.trim());
  if (!lib || !picked) throw new AdsHttpError(404, "not_found", "Ozzy couldn't find that hook in your library. Refresh the page and try again.");
  const brand =
    (row?.brandProfileId ? await prisma.brandProfile.findFirst({ where: { id: row.brandProfileId, workspaceId: ws.id }, select: { id: true, url: true } }) : null) ??
    (await prisma.brandProfile.findFirst({ where: { workspaceId: ws.id, runs: { some: { kind: { notIn: ["gift"] } } } }, orderBy: { updatedAt: "desc" }, select: { id: true, url: true } }));
  if (!brand) throw new AdsHttpError(409, "no_brand", "Make one pack of ads for your website first, then Ozzy can use your hooks.");
  const result = await startRun(
    { url: brand.url, brandProfileId: brand.id, seed: { angle: picked.text, hook: picked.text, origin: "hook_library" }, awareness: [picked.level === "offer" ? "product_aware" : picked.level] },
    ctx,
  );
  await trackAdsEvent("bonus_hook_used", { workspaceId: ws.id, userId: ctx.user.id, runId: result.runId, props: { program: "ad_department", kind: "hook_library", level: picked.level } }).catch(() => undefined);
  return { runId: result.runId };
}
