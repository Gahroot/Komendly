// DB loader for the owner command center and the weekly review. Read-only, no schema change: AdsEvent first touch,
// OutboundSend, EngineHeartbeat and AdsFeatureFlag. Internal/test accounts are excluded (same rule as the scoreboard).
import { prisma } from "@/lib/prisma";
import { loadInternalIds } from "@/lib/internal-accounts";
import { parseFirstTouch, serializeFirstTouch, type FirstTouch } from "@/lib/analytics/first-touch";
import { newPayments } from "@/lib/ads/scoreboard";
import { GROWTH_SYSTEMS, parseBeat, systemFlagKey, systemHealth, systemHeartbeatId, type SystemHealth } from "./systems";
import { countBySource, type SourceSignup, type SourceStats } from "./ecosystem";

const DAY_MS = 24 * 3600 * 1000;

function touchOf(props: unknown): FirstTouch | null {
  const p = (props ?? {}) as { firstTouch?: unknown; meta?: { firstTouch?: unknown } };
  const t = p.firstTouch ?? p.meta?.firstTouch;
  return t && typeof t === "object" ? parseFirstTouch(serializeFirstTouch(t as FirstTouch)) : null;
}
function hostOf(ref?: string): string | null {
  if (!ref) return null;
  try { return new URL(ref).host; } catch { return ref.slice(0, 60); }
}

export interface EcosystemLive {
  sources: SourceStats[];
  payingCustomers: number;
  signups7d: number;
  systems: { key: string; label: string; enabled: boolean; health: SystemHealth; outputs: number; lastRunAt: string | null; lastError: string | null }[];
  klySendsTotal: number;
}

export async function loadEcosystemLive(now: Date = new Date()): Promise<EcosystemLive> {
  const internal = await loadInternalIds();
  const internalUsers = new Set(internal.userIds);
  const signedUp = (
    await prisma.adsEvent.findMany({ where: { name: "signed_up", workspaceId: { not: null, notIn: internal.workspaceIds } }, orderBy: { createdAt: "asc" }, select: { workspaceId: true, userId: true, props: true, createdAt: true } })
  ).filter((s) => !s.userId || !internalUsers.has(s.userId));
  const firstByWs = new Map<string, (typeof signedUp)[number]>();
  for (const s of signedUp) if (s.workspaceId && !firstByWs.has(s.workspaceId)) firstByWs.set(s.workspaceId, s);
  const ids = [...firstByWs.keys()];

  const flagKeys = GROWTH_SYSTEMS.map((s) => systemFlagKey(s.key));
  const [klyLeads, klyGifts, referrals, payEvents, klySends, flags, beats] = await Promise.all([
    prisma.outboundLead.findMany({ where: { workspaceId: { in: ids } }, select: { workspaceId: true } }),
    prisma.adsGift.findMany({ where: { claimedWorkspaceId: { in: ids }, source: { in: ["outbound", "admin_outreach"] } }, select: { claimedWorkspaceId: true } }),
    prisma.adsReferral.findMany({ where: { referredWorkspaceId: { in: ids }, status: { not: "rejected" } }, select: { referredWorkspaceId: true } }),
    prisma.adsEvent.findMany({ where: { name: { in: ["purchased", "paid_converted"] }, workspaceId: { not: null, notIn: internal.workspaceIds } }, select: { workspaceId: true, name: true, props: true, createdAt: true } }),
    prisma.outboundSend.count({ where: { dryRun: false, kind: "sequence" } }),
    prisma.adsFeatureFlag.findMany({ where: { key: { in: flagKeys } } }),
    prisma.engineHeartbeat.findMany({ where: { id: { in: GROWTH_SYSTEMS.map((s) => systemHeartbeatId(s.key)) } } }),
  ]);
  const kly = new Set([...klyLeads.map((l) => l.workspaceId), ...klyGifts.map((g) => g.claimedWorkspaceId)].filter((x): x is string => !!x));
  const referred = new Set(referrals.map((r) => r.referredWorkspaceId));
  const signups: SourceSignup[] = [...firstByWs.entries()].map(([id, s]) => {
    const t = touchOf(s.props);
    return { workspaceId: id, utmSource: t?.utm_source, referrerHost: hostOf(t?.referrer), klyLead: kly.has(id), referral: referred.has(id) };
  });
  const payers = new Set(newPayments(payEvents.flatMap((e) => (e.workspaceId ? [{ ...e, workspaceId: e.workspaceId }] : []))).map((p) => p.workspaceId));
  const counts = countBySource(signups, payers);

  const flagOn = new Map(flags.map((f) => [f.key, f.enabled]));
  const beatById = new Map(beats.map((b) => [b.id, parseBeat(b.meta)]));
  const systems = GROWTH_SYSTEMS.map((s) => {
    const enabled = Boolean(flagOn.get(systemFlagKey(s.key)));
    const beat = beatById.get(systemHeartbeatId(s.key)) ?? null;
    return { key: s.key, label: s.label, enabled, health: systemHealth(s, enabled, beat, now), outputs: beat?.outputs ?? 0, lastRunAt: beat?.lastRunAt ?? null, lastError: beat?.lastError ?? null };
  });

  const rows = new Map<string, SourceStats>();
  const take = (source: string, label: string, actions: number | null, flag?: string) => {
    const c = counts.get(source) ?? { signups: 0, payments: 0 };
    rows.set(source, { source, label, actions, signups: c.signups, payments: c.payments, flag, flagOn: flag ? Boolean(flagOn.get(flag)) : undefined });
  };
  take("kly", "Kly cold email", klySends); // switched off by KlySettings / outbound flag, never flipped by the review
  for (const s of GROWTH_SYSTEMS) {
    const sys = systems.find((x) => x.key === s.key)!;
    take(s.utmSource, s.label, sys.outputs, systemFlagKey(s.key));
  }
  for (const [source, c] of counts) if (!rows.has(source)) rows.set(source, { source, label: source, actions: null, signups: c.signups, payments: c.payments });
  const since = now.getTime() - 7 * DAY_MS;
  return { sources: [...rows.values()], payingCustomers: payers.size, signups7d: [...firstByWs.values()].filter((s) => s.createdAt.getTime() >= since).length, systems, klySendsTotal: klySends };
}
