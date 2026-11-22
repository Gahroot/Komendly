// Ozzy's team: owner intent (MarketingMandate) + dashboard data. Next/Prisma glue; the engine does the Meta work (prd.md).
import type { AdsWorkspace, PrismaClient, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCookieUser } from "@/lib/auth";
import { currentAgent } from "@/lib/agent-keys/context";
import { trackAdsEvent } from "@/lib/ads/events";
import { isAdDepartment } from "@/lib/ads/weekly-drop";
import { metaAccess } from "@/lib/ads/meta/access";
import { publisherForWorkspace } from "@/lib/ads/meta/connection";
import { accountReadiness } from "@/lib/ads/meta/readiness";
import type { MetaAdAccount, MetaPage } from "@/lib/ads/meta/core/types";
import { AdsHttpError, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";
import {
  TEAM_EVENTS, TEAM_ROLES, TEAM_TERMS_VERSION, authorizationText, formatMoney, monthKey, parseMandateInput, type TeamRole,
} from "./contracts";
import { enqueueTeamPause } from "./stop";
import {
  adAccountNameFromText, buildRoster, feedItem, monthStartDay, planOwnerChange, statusLine, teamNumbers,
  type MandateView, type TeamFeedItem, type TeamMetaView, type TeamStatus,
} from "./rules";

type Db = PrismaClient;
export interface MetaAccounts { adAccounts: MetaAdAccount[]; pages: MetaPage[] }
export interface TeamDeps {
  db: Db;
  loadMetaAccounts: (workspaceId: string) => Promise<MetaAccounts>;
  track: typeof trackAdsEvent;
  now: () => Date;
}

/** Live account + Page list from Meta (network). */
export async function loadMetaAccounts(workspaceId: string): Promise<MetaAccounts> {
  const publisher = await publisherForWorkspace(workspaceId);
  try {
    const [adAccounts, pages] = await Promise.all([publisher.listAdAccounts(), publisher.listPages()]);
    return { adAccounts, pages };
  } finally {
    await publisher.close?.();
  }
}

const defaults = (): TeamDeps => ({ db: prisma, loadMetaAccounts, track: trackAdsEvent, now: () => new Date() });

export interface TeamAccess { user: User; workspace: AdsWorkspace; role: string }

/**
 * Signed-in member of the user's workspace. `human: true` (spend authorization) refuses API keys and connected
 * assistants: only a person signed in on komendly.com may authorize ad spend.
 */
export async function requireTeamAccess(opts: { human?: boolean } = {}): Promise<TeamAccess> {
  let user: User | null;
  if (opts.human) {
    if (currentAgent()) throw new AdsHttpError(403, "api_key_refused", "Only you can authorize ad spend. Sign in on komendly.com to do this.");
    user = await getCookieUser();
    if (!user) throw new AdsHttpError(403, "api_key_refused", "Only you can authorize ad spend. Sign in on komendly.com to do this.");
  } else {
    user = await requireUser();
  }
  const workspace = await getOrCreateWorkspace(user);
  const member = await prisma.adsWorkspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } }, select: { role: true } });
  return { user, workspace, role: member?.role ?? (workspace.ownerId === user.id ? "owner" : "member") };
}

export async function businessNameFor(db: Db, ws: Pick<AdsWorkspace, "id" | "name">): Promise<string> {
  const brand = await db.brandProfile.findFirst({ where: { workspaceId: ws.id, name: { not: null } }, orderBy: { updatedAt: "desc" }, select: { name: true } });
  return brand?.name?.trim() || ws.name;
}

const stripAct = (id: string) => id.replace(/^act_/, "");

function mandateView(m: {
  status: string; state: string; stateReason: string | null; monthlyLimitMinor: number; currency: string; zips: string[]; leadEmail: string;
  privacyUrl: string | null; adAccountId: string; pageId: string; authorizedAt: Date; authorizationText: string; termsVersion: string;
  launchedAt: Date | null; campaignId: string | null;
}): MandateView {
  return {
    status: m.status, state: m.state, stateReason: m.stateReason, monthlyLimitMinor: m.monthlyLimitMinor, currency: m.currency, zips: m.zips,
    leadEmail: m.leadEmail, privacyUrl: m.privacyUrl, adAccountId: m.adAccountId, pageId: m.pageId, authorizedAt: m.authorizedAt.toISOString(),
    authorizationText: m.authorizationText, termsVersion: m.termsVersion, launchedAt: m.launchedAt?.toISOString() ?? null, campaignId: m.campaignId,
  };
}

/** Funnel event at most once per workspace. */
async function trackOnce(deps: TeamDeps, name: (typeof TEAM_EVENTS)[keyof typeof TEAM_EVENTS], data: { workspaceId: string; userId: string; props?: Record<string, unknown> }) {
  const seen = await deps.db.adsEvent.findFirst({ where: { name, workspaceId: data.workspaceId }, select: { id: true } });
  if (!seen) await deps.track(name, data);
}

/** Everything /ads/team shows. Meta is asked live for names + readiness; if it can't be reached, that's shown, not guessed. */
export async function loadTeamStatus(a: TeamAccess, d: Partial<TeamDeps> = {}): Promise<TeamStatus> {
  const deps = { ...defaults(), ...d };
  const { db } = deps;
  const ws = a.workspace;
  const hired = isAdDepartment(ws);
  const now = deps.now();
  const [mandate, conn, access, businessName] = await Promise.all([
    db.marketingMandate.findUnique({ where: { workspaceId: ws.id } }),
    db.metaConnection.findUnique({ where: { workspaceId: ws.id }, select: { adAccountId: true, pageId: true } }),
    metaAccess(ws),
    businessNameFor(db, ws),
  ]);

  const meta: TeamMetaView = { access, connected: !!conn, selection: conn ? { adAccountId: conn.adAccountId, pageId: conn.pageId } : null, accounts: null, adAccountName: null, pageName: null, currency: mandate?.currency ?? "USD", readiness: null };
  if (conn && access === "ok") {
    try {
      const { adAccounts, pages } = await deps.loadMetaAccounts(ws.id);
      meta.accounts = { adAccounts: adAccounts.map((x) => ({ id: x.id, name: x.name, currency: x.currency, readiness: accountReadiness(x, pages) })), pages, readiness: accountReadiness(null, pages) };
      const accId = mandate?.adAccountId ?? conn.adAccountId;
      const pageId = mandate?.pageId ?? conn.pageId;
      const acc = accId ? adAccounts.find((x) => stripAct(x.id) === stripAct(accId)) : undefined;
      meta.adAccountName = acc?.name ?? null;
      meta.pageName = pages.find((p) => p.id === pageId)?.name ?? null;
      if (acc && !mandate) meta.currency = acc.currency ?? "USD";
      meta.readiness = acc ? accountReadiness(acc, pages) : null;
      if (hired && acc && pageId) await trackOnce(deps, TEAM_EVENTS.metaConnected, { workspaceId: ws.id, userId: a.user.id });
    } catch (e) {
      meta.accounts = { error: e instanceof AdsHttpError ? e.message : "We couldn't reach Meta just now. Try again in a minute." };
    }
  }
  if (mandate && !meta.adAccountName) meta.adAccountName = adAccountNameFromText(mandate.authorizationText);

  const view = mandate ? mandateView(mandate) : null;
  let numbers: TeamStatus["numbers"] = null;
  let feed: TeamFeedItem[] = [];
  const latest: Partial<Record<TeamRole, TeamFeedItem>> = {};
  let leads: TeamStatus["leads"] = [];
  if (mandate) {
    const first = monthStartDay(now);
    const key = monthKey(now);
    const [perfRows, leadsReceived, actions, roleLatest, leadRows] = await Promise.all([
      db.adPerformanceDay.findMany({ where: { workspaceId: ws.id, day: { gte: first } }, select: { spendMinor: true, leads: true } }),
      db.metaLead.findMany({ where: { workspaceId: ws.id, receivedAt: { gte: new Date(now.getTime() - 32 * 86_400_000) } }, select: { receivedAt: true } })
        .then((rows) => rows.filter((r) => monthKey(r.receivedAt) === key).length),
      db.marketingAction.findMany({ where: { workspaceId: ws.id }, orderBy: { createdAt: "desc" }, take: 50 }),
      Promise.all((Object.keys(TEAM_ROLES) as TeamRole[]).map((role) =>
        db.marketingAction.findFirst({ where: { workspaceId: ws.id, role, kind: { notIn: ["authorized", "limit_changed", "owner_paused", "owner_resumed"] } }, orderBy: { createdAt: "desc" } }))),
      db.metaLead.findMany({ where: { workspaceId: ws.id, deletedAt: null }, orderBy: { receivedAt: "desc" }, take: 50 }),
    ]);
    numbers = teamNumbers({ perfRows, leadsReceived, now, monthlyLimitMinor: mandate.monthlyLimitMinor });
    feed = actions.map(feedItem);
    for (const r of roleLatest) if (r) latest[r.role as TeamRole] = feedItem(r);
    leads = leadRows.map((l) => ({
      id: l.id, name: l.name, email: l.email, phone: l.phone, zip: l.zip, receivedAt: l.receivedAt.toISOString(),
      answers: Array.isArray(l.answers) ? (l.answers as Array<{ label?: unknown; text?: unknown }>).map((x) => ({ label: String(x?.label ?? ""), text: String(x?.text ?? "") })) : [],
    }));
  }
  return {
    hired, isOwner: a.role === "owner", ownerEmail: a.user.email, businessName, meta, mandate: view, numbers,
    statusLine: statusLine(view, hired), roster: buildRoster(latest, mandate?.leadEmail ?? null), feed, leads,
  };
}

/** POST /api/ads/team/authorize: the owner hires the team (or re-hires after a stop). */
export async function authorizeTeam(a: TeamAccess, body: unknown, d: Partial<TeamDeps> = {}): Promise<MandateView> {
  const deps = { ...defaults(), ...d };
  const { db } = deps;
  const ws = a.workspace;
  if (a.role !== "owner") throw new AdsHttpError(403, "owner_only", "Only the account owner can hire the team.");
  if (!isAdDepartment(ws)) throw new AdsHttpError(402, "needs_plan", "Hiring the team needs an active Ozzy Ad Department or Agency plan.");
  const existing = await db.marketingMandate.findUnique({ where: { workspaceId: ws.id }, select: { status: true } });
  if (existing?.status === "active") throw new AdsHttpError(409, "already_hired", "Your team is already working. Change your budget or ZIP codes below.");
  const parsed = parseMandateInput(body);
  if (!parsed.ok) throw new AdsHttpError(400, "invalid", parsed.error);
  const conn = await db.metaConnection.findUnique({ where: { workspaceId: ws.id }, select: { adAccountId: true, pageId: true } });
  if (!conn) throw new AdsHttpError(409, "meta_not_connected", "Connect your Meta account first.");
  if (!conn.adAccountId || !conn.pageId) throw new AdsHttpError(409, "meta_selection", "Pick your ad account and Facebook Page first.");
  let accounts: MetaAccounts;
  try {
    accounts = await deps.loadMetaAccounts(ws.id);
  } catch (e) {
    if (e instanceof AdsHttpError) throw e;
    throw new AdsHttpError(502, "meta_unreachable", "We couldn't reach Meta to check your ad account. Try again in a minute.");
  }
  const acc = accounts.adAccounts.find((x) => stripAct(x.id) === stripAct(conn.adAccountId!));
  if (!acc) throw new AdsHttpError(409, "meta_selection", "We can't see that ad account anymore. Pick it again in step 1.");
  if (!accounts.pages.some((p) => p.id === conn.pageId)) throw new AdsHttpError(409, "meta_selection", "We can't see that Facebook Page anymore. Pick it again in step 1.");
  const readiness = accountReadiness(acc, accounts.pages);
  if (!readiness.ok) throw new AdsHttpError(409, "not_ready", readiness.issues[0]?.text ?? "This ad account can't run ads yet.", { issues: readiness.issues });

  const currency = acc.currency ?? "USD";
  const text = authorizationText({ monthlyLimitMinor: parsed.value.monthlyLimitMinor, currency, adAccountName: acc.name, businessName: await businessNameFor(db, ws) });
  // The page shows the text it will send; if anything changed in between, the owner must read it again.
  const shown = (body as { authorizationText?: unknown }).authorizationText;
  if (typeof shown === "string" && shown !== text) throw new AdsHttpError(409, "text_changed", "The authorization text changed. Please read it again and confirm.", { authorizationText: text });

  const now = deps.now();
  const v = parsed.value;
  const fields = {
    status: "active", monthlyLimitMinor: v.monthlyLimitMinor, currency, zips: v.zips, leadEmail: v.leadEmail, privacyUrl: v.privacyUrl,
    adAccountId: conn.adAccountId, pageId: conn.pageId, authorizedAt: now, authorizedByUserId: a.user.id, authorizationText: text, termsVersion: TEAM_TERMS_VERSION,
  };
  const m = await db.marketingMandate.upsert({ where: { workspaceId: ws.id }, create: { workspaceId: ws.id, ...fields, state: "pending" }, update: fields });
  await db.marketingAction.create({ data: { workspaceId: ws.id, role: "director", kind: "authorized", summary: `You hired the team with a limit of ${formatMoney(v.monthlyLimitMinor, currency)} a month in ${v.zips.length} ZIP code${v.zips.length === 1 ? "" : "s"}.` } });
  await deps.track(TEAM_EVENTS.authorized, { workspaceId: ws.id, userId: a.user.id, props: { monthlyLimitMinor: v.monthlyLimitMinor, currency, zips: v.zips.length, termsVersion: TEAM_TERMS_VERSION, rehire: !!existing } });
  return mandateView(m);
}

/** PATCH /api/ads/team: pause (anyone in the workspace), resume / change limit, ZIPs, lead email (owner, re-authorized). */
export async function changeTeam(a: TeamAccess, body: unknown, d: Partial<TeamDeps> = {}): Promise<MandateView> {
  const deps = { ...defaults(), ...d };
  const { db } = deps;
  const ws = a.workspace;
  const m = await db.marketingMandate.findUnique({ where: { workspaceId: ws.id } });
  if (!m) throw new AdsHttpError(404, "not_hired", "You haven't hired the team yet.");
  const isPause = (body as { action?: unknown } | null)?.action === "pause";
  if (!isPause && a.role !== "owner") throw new AdsHttpError(403, "owner_only", "Only the account owner can change the budget or turn ads back on.");
  const first = monthStartDay(deps.now());
  const mtd = await db.adPerformanceDay.aggregate({ where: { workspaceId: ws.id, day: { gte: first } }, _sum: { spendMinor: true } });
  const plan = planOwnerChange(m, body, { monthToDateMinor: mtd._sum.spendMinor ?? 0 });
  if (!plan.ok) throw new AdsHttpError(plan.status, plan.code, plan.error);
  if (plan.noop) return mandateView(m);
  if (plan.update.status === "active" && !isAdDepartment(ws)) throw new AdsHttpError(402, "needs_plan", "Turning ads back on needs an active Ozzy Ad Department or Agency plan.");
  const now = deps.now();
  const data: Record<string, unknown> = { ...plan.update };
  if (plan.reauthorize) {
    const adAccountName = adAccountNameFromText(m.authorizationText) ?? m.adAccountId;
    data.authorizationText = authorizationText({ monthlyLimitMinor: plan.reauthorize.monthlyLimitMinor, currency: m.currency, adAccountName, businessName: await businessNameFor(db, ws) });
    data.termsVersion = TEAM_TERMS_VERSION;
    data.authorizedAt = now;
    data.authorizedByUserId = a.user.id;
  }
  // Pause job first: the engine acts on the job, the mandate row records the owner's intent.
  if (plan.pauseReason) await enqueueTeamPause(db, ws.id, plan.pauseReason);
  const updated = await db.marketingMandate.update({ where: { workspaceId: ws.id }, data });
  for (const x of plan.actions) await db.marketingAction.create({ data: { workspaceId: ws.id, role: "director", kind: x.kind, summary: x.summary } });
  if (plan.update.status === "paused") await deps.track(TEAM_EVENTS.paused, { workspaceId: ws.id, userId: a.user.id, props: { reason: "owner" } });
  return mandateView(updated);
}

/** DELETE /api/ads/team/leads/[id]: soft delete, only inside this workspace; personal details are wiped. */
export async function deleteLead(a: TeamAccess, leadId: string, d: Partial<TeamDeps> = {}): Promise<void> {
  const deps = { ...defaults(), ...d };
  const r = await deps.db.metaLead.updateMany({
    where: { id: leadId, workspaceId: a.workspace.id, deletedAt: null },
    data: { deletedAt: deps.now(), name: null, email: null, phone: null, zip: null, answers: [] },
  });
  if (r.count === 0) throw new AdsHttpError(404, "not_found", "Not found.");
}
