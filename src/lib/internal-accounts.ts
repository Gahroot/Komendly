// One rule for "this account is us, not a customer": e2e/test accounts, Resend test sinks, our own domains and the
// founder's personal accounts. Every admin stat excludes them (funnel, sign-ups, HQ, ads overview, Studio, legacy
// stats, experiment readouts). Add more without a deploy via INTERNAL_EMAILS (comma-separated, exact addresses).
import { prisma } from "@/lib/prisma";
import { isInternalEmail } from "./internal-email";

export { isInternalEmail };

export interface InternalIds {
  userIds: string[];
  workspaceIds: string[];
  /** Browser ids (AdsEvent props.anonId) these accounts signed up from, so their own landing visits drop out too. */
  anonIds: string[];
}

let cache: { at: number; ids: InternalIds } | null = null;
const TTL_MS = 60_000;

/** Ids of internal users, the workspaces they own and the browsers they signed up from (cached 60s per instance). */
export async function loadInternalIds(now: number = Date.now()): Promise<InternalIds> {
  if (cache && now - cache.at < TTL_MS) return cache.ids;
  const users = (await prisma.user.findMany({ select: { id: true, email: true } })).filter((u) => isInternalEmail(u.email));
  const userIds = users.map((u) => u.id);
  const [workspaces, signups] = await Promise.all([
    prisma.adsWorkspace.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } }),
    prisma.adsEvent.findMany({ where: { name: "signed_up", userId: { in: userIds } }, select: { props: true } }),
  ]);
  const anonIds = [...new Set(signups.map((s) => (s.props as { anonId?: unknown } | null)?.anonId).filter((a): a is string => typeof a === "string" && a.length > 0))];
  const ids = { userIds, workspaceIds: workspaces.map((w) => w.id), anonIds };
  cache = { at: now, ids };
  return ids;
}

/** Prisma filter fragments. */
export const notInternalWorkspace = (ids: InternalIds) => ({ notIn: ids.workspaceIds });
export const notInternalUser = (ids: InternalIds) => ({ notIn: ids.userIds });
