// DB loader for the admin funnel by source; all maths lives in funnel.ts.
import { loadInternalIds } from "@/lib/internal-accounts";
import { prisma } from "@/lib/prisma";
import { parseFirstTouch, serializeFirstTouch, type FirstTouch } from "@/lib/analytics/first-touch";
import { campaignEconomics, cohortsByWeek, funnelBySource, funnelTotal, isBotVisit, isFunnelTestEmail, revenuePayments, studioFunnel, sumRevenueCents, type GroupBy, type SignupRow, type StudioWorkspaceFacts, adEconomics } from "./funnel";
import { isTestEmail } from "./signups";
import { loadMetaAdSpend, loadMetaCampaignSpend } from "./meta-insights";

const DAY_MS = 24 * 3600 * 1000;
const ACTIVE = new Set(["active", "past_due", "trialing"]);

function touchOf(props: unknown): FirstTouch | null {
  const p = (props ?? {}) as { firstTouch?: unknown; meta?: { firstTouch?: unknown } };
  const t = p.firstTouch ?? p.meta?.firstTouch;
  return t && typeof t === "object" ? parseFirstTouch(serializeFirstTouch(t as FirstTouch)) : null;
}

/** Range is [from, to) by sign-up / landing time; downstream steps count whenever they happened (up to now). */
export async function loadSourceFunnel(from: Date, to: Date, by: GroupBy, now: Date = new Date(), campaign?: string) {
  const internal = await loadInternalIds();
  const internalAnon = new Set(internal.anonIds);
  const ours = (props: unknown) => internalAnon.has(String((props as { anonId?: unknown } | null)?.anonId ?? ""));
  const [landedAll, engagedAll, signedUp] = await Promise.all([
    prisma.adsEvent.findMany({ where: { name: "visit_landed", createdAt: { gte: from, lt: to } }, select: { props: true, createdAt: true } }),
    prisma.adsEvent.findMany({ where: { name: "visit_engaged", createdAt: { gte: from, lt: new Date(to.getTime() + DAY_MS) } }, select: { props: true, createdAt: true } }),
    prisma.adsEvent.findMany({ where: { name: "signed_up", createdAt: { gte: from, lt: to }, workspaceId: { not: null, notIn: internal.workspaceIds } }, select: { workspaceId: true, props: true, createdAt: true } }),
  ]);
  // Our own browsers (internal accounts' sign-up anonIds) are not visitors.
  const landed = landedAll.filter((l) => !ours(l.props));
  const engagedEvents = engagedAll.filter((e) => !ours(e.props));
  const ids = [...new Set(signedUp.map((s) => s.workspaceId).filter((x): x is string => !!x))];
  const [workspaces, trials, payments, ads] = await Promise.all([
    prisma.adsWorkspace.findMany({ where: { id: { in: ids } }, select: { id: true, subscriptionStatus: true, canceledAt: true, stripeSubscriptionId: true } }),
    prisma.adRun.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: ids }, isTrial: true, status: { in: ["completed", "partial"] } }, _count: true }),
    prisma.adsEvent.findMany({ where: { workspaceId: { in: ids }, name: { in: ["purchased", "renewed", "paid_converted"] } }, orderBy: { createdAt: "asc" }, select: { workspaceId: true, name: true, props: true, createdAt: true } }),
    prisma.ad.findMany({ where: { workspaceId: { in: ids } }, select: { workspaceId: true, costMicros: true, createdAt: true } }),
  ]);
  const ws = new Map(workspaces.map((w) => [w.id, w]));
  const trialDone = new Set(trials.map((t) => t.workspaceId));
  const rows: SignupRow[] = signedUp.flatMap((s) => {
    const id = s.workspaceId;
    if (!id) return [];
    const w = ws.get(id);
    const pays = payments.filter((p) => p.workspaceId === id);
    const money = revenuePayments(pays);
    const day30 = s.createdAt.getTime() + 30 * DAY_MS;
    return [{
      workspaceId: id,
      touch: touchOf(s.props),
      signedUpAt: s.createdAt,
      trialFinished: trialDone.has(id),
      firstPaidAt: pays[0]?.createdAt ?? null,
      subscribed: pays.some((p) => p.name === "paid_converted" || (p.props as { mode?: unknown } | null)?.mode === "subscription"),
      canceledAt: w?.canceledAt ?? null,
      currentlyActive: !!w?.stripeSubscriptionId && ACTIVE.has(w.subscriptionStatus),
      revenueCents: sumRevenueCents(money),
      revenue30dCents: sumRevenueCents(money.filter((p) => p.createdAt.getTime() <= day30)),
      cost30dMicros: ads.filter((a) => a.workspaceId === id && a.createdAt.getTime() <= day30).reduce((t, a) => t + Number(a.costMicros), 0),
    }];
  });
  // Landed excludes bot-flagged visits (Meta ad review); engaged = same anonId sent the engagement beacon that UTC day.
  const anonDay = (props: unknown, at: Date) => `${String((props as { anonId?: unknown } | null)?.anonId ?? "")}|${at.toISOString().slice(0, 10)}`;
  const engaged = new Set(engagedEvents.filter((e) => !isBotVisit(e.props)).map((e) => anonDay(e.props, e.createdAt)));
  const visits = landed.filter((l) => !isBotVisit(l.props)).map((l) => ({ touch: touchOf(l.props), engaged: engaged.has(anonDay(l.props, l.createdAt)) }));
  const botVisits = landed.length - visits.length;
  const funnel = funnelBySource(visits, rows, by, now);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const spend = await loadMetaCampaignSpend(day(from), day(new Date(to.getTime() - 1)));
  // Only our (prefix-matched) campaigns: drop sign-up-only rows from other campaign ids/names that aren't ours.
  const ourIds = new Set(spend.campaigns.map((c) => c.campaignId));
  const campaigns = campaignEconomics(spend.campaigns, rows, now).filter((c) => spend.status !== "ok" || ourIds.has(c.campaignId) || !/^\d+$/.test(c.campaignId));
  // Ad table: requested campaign, else the top-spend campaign.
  const adCampaignId = campaign && /^\d+$/.test(campaign) ? campaign : spend.campaigns.slice().sort((a, b) => b.spendCents - a.spendCents)[0]?.campaignId;
  const adSpend = adCampaignId ? await loadMetaAdSpend(adCampaignId, day(from), day(new Date(to.getTime() - 1))) : { ads: [], status: spend.status, error: spend.error };
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    by,
    funnel,
    total: funnelTotal(funnel),
    cohorts: cohortsByWeek(rows, now),
    campaigns,
    adCampaignId,
    ads: adEconomics(adSpend.ads, rows, adCampaignId ?? ""),
    adStatus: adSpend.status,
    adError: adSpend.error,
    botVisits,
    spendStatus: spend.status,
    spendError: spend.error,
  };
}

/** Parse ?from=YYYY-MM-DD&to=YYYY-MM-DD&by=... (to inclusive); defaults to the last 30 days by campaign. */
export function parseFunnelQuery(q: { from?: string; to?: string; by?: string }, now: Date = new Date()): { from: Date; to: Date; by: GroupBy } {
  const valid = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? new Date(`${s}T00:00:00Z`) : null);
  const to = valid(q.to) ? new Date((valid(q.to) as Date).getTime() + DAY_MS) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY_MS);
  const from = valid(q.from) ?? new Date(to.getTime() - 30 * DAY_MS);
  const by: GroupBy = q.by === "channel" || q.by === "source" || q.by === "content" ? q.by : "campaign";
  return { from, to, by };
}

const STUDIO_CHECKOUT_EVENTS = ["studio_checkout_started", "checkout_started"];

/** Studio funnel for workspaces that signed up in the last `days` days (test/e2e emails excluded); steps count up to now. */
export async function loadStudioFunnel(days: number, now: Date = new Date()) {
  const from = new Date(now.getTime() - days * DAY_MS);
  const signedUp = await prisma.adsEvent.findMany({ where: { name: "signed_up", createdAt: { gte: from, lt: now }, workspaceId: { not: null } }, select: { workspaceId: true, userId: true } });
  const userIds = [...new Set(signedUp.map((s) => s.userId).filter((x): x is string => !!x))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } });
  const test = new Set(users.filter((u) => isFunnelTestEmail(u.email) || isTestEmail(u.email)).map((u) => u.id));
  for (const id of (await loadInternalIds()).userIds) test.add(id);
  const ids = [...new Set(signedUp.filter((s) => !s.userId || !test.has(s.userId)).map((s) => s.workspaceId).filter((x): x is string => !!x))].sort();
  const events = await prisma.adsEvent.findMany({
    where: { workspaceId: { in: ids }, name: { in: ["studio_session_started", "studio_message_sent", "studio_first_render", "studio_paywall_shown", "studio_offer_viewed", ...STUDIO_CHECKOUT_EVENTS, "purchased", "paid_converted"] } },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true, name: true, props: true, createdAt: true },
  });
  const facts = new Map<string, StudioWorkspaceFacts>(ids.map((id) => [id, { workspaceId: id, sessionAt: null, messageAt: null, firstRenderAt: null, paywallAt: null, checkoutAt: null, paymentsAt: [] }]));
  for (const e of events) {
    const f = e.workspaceId ? facts.get(e.workspaceId) : undefined;
    if (!f) continue;
    const studioCheckout = e.name === "studio_checkout_started" || (e.name === "checkout_started" && (e.props as { app?: unknown } | null)?.app === "studio");
    if (e.name === "studio_session_started") f.sessionAt ??= e.createdAt;
    else if (e.name === "studio_message_sent") f.messageAt ??= e.createdAt;
    else if (e.name === "studio_first_render") f.firstRenderAt ??= e.createdAt;
    else if (e.name === "studio_paywall_shown" || e.name === "studio_offer_viewed") f.paywallAt ??= e.createdAt;
    else if (studioCheckout) f.checkoutAt ??= e.createdAt;
    else if (e.name === "purchased" || e.name === "paid_converted") f.paymentsAt = [...f.paymentsAt, e.createdAt];
  }
  return { days, from: from.toISOString(), excludedTest: signedUp.length - signedUp.filter((s) => !s.userId || !test.has(s.userId)).length, steps: studioFunnel([...facts.values()]) };
}
