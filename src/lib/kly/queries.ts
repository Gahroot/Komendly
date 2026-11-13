// DB reads for the Kly control centre (/admin/ads/outbound). Pure maths lives in ./aggregate.
import { prisma } from "@/lib/prisma";
import { summarizeWarmup } from "./warmup-stats";
import { autoPauseReason, DEFAULT_DOMAIN_DAILY_CAP, mailboxDayLimit, sendDayStart } from "@/lib/ads/outbound/policy";
import { budgetUse, dailySeries, freshness, funnelSteps, groupArms, money, ozzyLine, type FunnelCounts } from "./aggregate";
import { KLY_SETTINGS_DEFAULTS, KLY_SETTINGS_ID, type KlySettingsInput } from "./settings";

const DAY = 86_400_000;

function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function metaFlag(meta: unknown, key: string): boolean | null {
  if (meta && typeof meta === "object" && key in meta) {
    const v = (meta as Record<string, unknown>)[key];
    if (typeof v === "boolean") return v;
  }
  return null;
}

async function funnelCounts(minLeadScore: number): Promise<FunnelCounts> {
  const c = (where: NonNullable<Parameters<typeof prisma.outboundLead.count>[0]>["where"]) => prisma.outboundLead.count({ where });
  const [found, qualified, giftMade, sent, clicked, replied, signedUp, paid] = await Promise.all([
    c({}),
    c({ score: { gte: minLeadScore } }),
    c({ giftId: { not: null } }),
    c({ step: { gt: 0 } }),
    c({ clickedAt: { not: null } }),
    c({ repliedAt: { not: null } }),
    c({ signedUpAt: { not: null } }),
    c({ paidAt: { not: null } }),
  ]);
  return { found, qualified, giftMade, sent, clicked, replied, signedUp, paid };
}

export async function loadKlyDashboard(now: Date = new Date()) {
  const today = utcDay(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const settingsRow = await prisma.klySettings.findUnique({ where: { id: KLY_SETTINGS_ID } });
  const settings: KlySettingsInput = settingsRow
    ? { enabled: settingsRow.enabled, autoScale: settingsRow.autoScale, autoReply: settingsRow.autoReply, voiceEnabled: settingsRow.voiceEnabled, dailyCallCap: settingsRow.dailyCallCap, hourlyCallCap: settingsRow.hourlyCallCap, dailySendCeiling: settingsRow.dailySendCeiling, dailyGiftCap: settingsRow.dailyGiftCap, monthlyBudgetCents: settingsRow.monthlyBudgetCents, maxCodexWeeklyPct: settingsRow.maxCodexWeeklyPct, minLeadScore: settingsRow.minLeadScore, minQualityScore: settingsRow.minQualityScore, followUpDays: settingsRow.followUpDays, maxSteps: settingsRow.maxSteps, explorationPct: settingsRow.explorationPct, targetCountries: settingsRow.targetCountries, notes: settingsRow.notes }
    : KLY_SETTINGS_DEFAULTS;

  const [counts, allTime, month, weekly, daily, decisions, arms, beats, flag, mailboxes, sends, replies, signups, payments, sentToday] = await Promise.all([
    funnelCounts(settings.minLeadScore),
    prisma.outboundLead.aggregate({ _sum: { revenueCents: true, costMicros: true } }),
    prisma.klyDaily.aggregate({ where: { day: { gte: monthStart } }, _sum: { revenueCents: true, costMicros: true } }),
    prisma.outboundLead.aggregate({ where: { signedUpAt: { gte: weekAgo } }, _count: { _all: true } }).then(async (s) => ({
      signups: s._count._all,
      paid: await prisma.outboundLead.count({ where: { paidAt: { gte: weekAgo } } }),
      revenue: (await prisma.outboundLead.aggregate({ where: { paidAt: { gte: weekAgo } }, _sum: { revenueCents: true } }))._sum.revenueCents ?? 0,
    })),
    prisma.klyDaily.findMany({ where: { day: { gte: new Date(today.getTime() - 29 * DAY) } }, orderBy: { day: "asc" } }),
    prisma.klyDecision.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.klyArm.findMany({ orderBy: [{ dimension: "asc" }, { key: "asc" }] }),
    prisma.engineHeartbeat.findMany({ where: { id: { in: ["kly", "provider:codex"] } } }),
    prisma.adsFeatureFlag.findUnique({ where: { key: "outbound" } }),
    prisma.outboundMailbox.findMany({ orderBy: { address: "asc" } }),
    prisma.outboundSend.findMany({ where: { kind: "sequence" }, orderBy: { sentAt: "desc" }, take: 12, include: { lead: { select: { businessName: true, giftToken: true, adId: true, qualityScore: true, status: true } } } }),
    prisma.outboundLead.findMany({ where: { repliedAt: { not: null } }, orderBy: { repliedAt: "desc" }, take: 10, select: { id: true, businessName: true, giftToken: true, adId: true, qualityScore: true, replyIntent: true, repliedAt: true, sends: { where: { replied: true }, orderBy: { sentAt: "desc" }, take: 1, select: { replySnippet: true } } } }),
    prisma.outboundLead.findMany({ where: { signedUpAt: { not: null } }, orderBy: { signedUpAt: "desc" }, take: 10, select: { id: true, businessName: true, giftToken: true, adId: true, qualityScore: true, signedUpAt: true } }),
    prisma.outboundLead.findMany({ where: { paidAt: { not: null } }, orderBy: { paidAt: "desc" }, take: 10, select: { id: true, businessName: true, giftToken: true, adId: true, qualityScore: true, paidAt: true, revenueCents: true } }),
    prisma.outboundSend.count({ where: { dryRun: false, kind: "sequence", sentAt: { gte: sendDayStart(now) } } }),
  ]);

  // Voice (The Tribunal): today's pushes and call outcomes.
  const [vPushed, vAccepted, vRejected, vEvents] = await Promise.all([
    prisma.outboundLead.count({ where: { voicePushedAt: { gte: today } } }),
    prisma.outboundLead.count({ where: { voicePushedAt: { gte: today }, NOT: { voiceStatus: "rejected" } } }),
    prisma.outboundLead.groupBy({ by: ["voiceReason"], where: { voicePushedAt: { gte: today }, voiceStatus: "rejected" }, _count: { _all: true } }),
    prisma.outboundVoiceEvent.groupBy({ by: ["type"], where: { at: { gte: today }, type: { in: ["call_started", "gift_yes", "opt_out"] } }, _count: { _all: true } }),
  ]);
  const evCount = (t: string) => vEvents.find((e) => e.type === t)?._count._all ?? 0;
  const voice = {
    pushed: vPushed,
    accepted: vAccepted,
    rejected: vRejected.map((r) => ({ reason: r.voiceReason ?? "unknown", count: r._count._all })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    called: evCount("call_started"),
    giftYes: evCount("gift_yes"),
    optOuts: evCount("opt_out"),
  };

  // Batched for hundreds of mailboxes: per-mailbox counts via groupBy; the full 100-send risk window only for Gmail boxes.
  const ids = mailboxes.map((m) => m.id);
  const [todayBy, rateBy, domainRows] = await Promise.all([
    prisma.outboundSend.groupBy({ by: ["mailboxId"], where: { mailboxId: { in: ids }, dryRun: false, kind: "sequence", sentAt: { gte: sendDayStart(now) } }, _count: { _all: true } }),
    prisma.outboundSend.groupBy({ by: ["mailboxId", "bounced", "complained"], where: { mailboxId: { in: ids }, dryRun: false, sentAt: { gte: new Date(now.getTime() - 14 * DAY) } }, _count: { _all: true } }),
    prisma.outboundDomain.findMany({ orderBy: { domain: "asc" } }),
  ]);
  const todayOf = new Map(todayBy.map((g) => [g.mailboxId, g._count._all]));
  const domainOf = new Map(domainRows.map((d) => [d.domain, d]));
  const mailboxHealth = await Promise.all(
    mailboxes.map(async (m) => {
      const rates = rateBy.filter((g) => g.mailboxId === m.id);
      const n = rates.reduce((a, g) => a + g._count._all, 0);
      const count = (k: "bounced" | "complained") => rates.filter((g) => g[k]).reduce((a, g) => a + g._count._all, 0);
      const recent = m.provider === "gmail" ? await prisma.outboundSend.findMany({ where: { mailboxId: m.id, dryRun: false }, orderBy: { sentAt: "desc" }, take: 100, select: { bounced: true, complained: true } }) : [];
      const domain = m.domain ?? m.address.split("@")[1] ?? "";
      const notReady = Boolean(m.readyAt && m.readyAt.getTime() > now.getTime());
      return {
        id: m.id, address: m.address, displayName: m.displayName, paused: m.paused, pausedReason: m.pausedReason, provider: m.provider, domain, readyAt: m.readyAt,
        status: (m.paused || domainOf.get(domain)?.paused ? "paused" : notReady ? "warming" : "live") as "paused" | "warming" | "live",
        warmupDay: Math.max(1, Math.floor((now.getTime() - m.warmupStartedAt.getTime()) / DAY) + 1),
        sentToday: todayOf.get(m.id) ?? 0, limit: mailboxDayLimit(m, now), cap: m.dailyCap,
        bounceRate: n ? count("bounced") / n : null,
        complaintRate: n ? count("complained") / n : null,
        risk: autoPauseReason(recent), sentTotal: m.sentTotal, repliedTotal: m.repliedTotal, lastSentAt: m.lastSentAt,
      };
    }),
  );
  const fleet = {
    total: mailboxHealth.length,
    live: mailboxHealth.filter((x) => x.status === "live").length,
    warming: mailboxHealth.filter((x) => x.status === "warming").length,
    paused: mailboxHealth.filter((x) => x.status === "paused").length,
    pausedWhy: Object.entries(mailboxHealth.filter((x) => x.paused).reduce<Record<string, number>>((a, x) => ({ ...a, [(x.pausedReason ?? "admin").replace(/\(.*\)|[0-9.]+%?/g, "").trim()]: (a[(x.pausedReason ?? "admin").replace(/\(.*\)|[0-9.]+%?/g, "").trim()] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]),
    sentToday: mailboxHealth.reduce((a, x) => a + x.sentToday, 0),
    capacity: [...mailboxHealth.filter((x) => x.status === "live").reduce((acc, x) => acc.set(x.domain, (acc.get(x.domain) ?? 0) + x.limit), new Map<string, number>())].reduce((a, [d, v]) => a + Math.min(v, domainOf.get(d)?.dailyCap ?? DEFAULT_DOMAIN_DAILY_CAP), 0),
    nextReadyAt: mailboxHealth.filter((x) => x.status === "warming" && x.readyAt).map((x) => x.readyAt as Date).sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
  };
  const domains = [...new Set(mailboxHealth.map((x) => x.domain))].sort().map((domain) => {
    const d = domainOf.get(domain);
    const boxes = mailboxHealth.filter((x) => x.domain === domain);
    return {
      domain, mailboxes: boxes.length, live: boxes.filter((x) => x.status === "live").length, sentToday: boxes.reduce((a, x) => a + x.sentToday, 0), cap: d?.dailyCap ?? DEFAULT_DOMAIN_DAILY_CAP,
      paused: d?.paused ?? false, pausedReason: d?.pausedReason ?? null, listedOn: d?.listedOn ?? [], checkedAt: d?.checkedAt ?? null, note: d?.checkNote ?? null,
      dns: { mx: d?.mxOk ?? null, spf: d?.spfOk ?? null, dkim: d?.dkimOk ?? null, dmarc: d?.dmarcOk ?? null },
    };
  }).sort((a, b) => Number(b.paused) - Number(a.paused) || a.domain.localeCompare(b.domain));

  // Peer warm-up (kly/src/warmup.ts): sent today per domain + 7-day placement per mailbox.
  const [wToday, wPlace, probeG] = await Promise.all([
    prisma.klyWarmupMessage.groupBy({ by: ["senderDomain"], where: { kind: "warmup", sentAt: { gte: sendDayStart(now) } }, _count: { _all: true } }),
    prisma.klyWarmupMessage.groupBy({ by: ["senderId", "placement"], where: { kind: "warmup", sentAt: { gte: weekAgo } }, _count: { _all: true } }),
    prisma.klyWarmupMessage.groupBy({ by: ["format", "placement"], where: { kind: "probe", sentAt: { gte: weekAgo } }, _count: { _all: true } }),
  ]);
  const wPlaceBy = new Map<string, { inbox: number; spam: number; missing: number }>();
  for (const g of wPlace) {
    const c = wPlaceBy.get(g.senderId) ?? { inbox: 0, spam: 0, missing: 0 };
    if (g.placement === "inbox" || g.placement === "spam" || g.placement === "missing") c[g.placement] += g._count._all;
    wPlaceBy.set(g.senderId, c);
  }
  // Cold spam check (kly/src/probe.ts): where copies of real cold emails landed in our own inboxes, by format.
  const probes = { html: { inbox: 0, spam: 0, missing: 0 }, plain: { inbox: 0, spam: 0, missing: 0 } };
  for (const g of probeG) {
    const f = g.format === "plain" ? probes.plain : probes.html;
    if (g.placement === "inbox" || g.placement === "spam" || g.placement === "missing") f[g.placement] += g._count._all;
  }
  const warmup = {
    probes,
    enabled: settingsRow?.warmupEnabled ?? true,
    perDay: settingsRow?.warmupPerDay ?? 40,
    ...summarizeWarmup(mailboxes.map((m) => ({ id: m.id, domain: m.domain ?? m.address.split("@")[1] ?? "", provider: m.provider, paused: m.paused, warmupEnabled: m.warmupEnabled, warmupSince: m.warmupSince, coldStartedAt: m.coldStartedAt })), wPlaceBy, new Map(wToday.map((g) => [g.senderDomain, g._count._all])), now, { minDays: settingsRow?.warmupMinDays, readySpamRate: settingsRow ? settingsRow.warmupReadySpamPct / 100 : undefined }),
  };

  // Gift thumbnails: first ready asset of each lead's hook ad, served by the token-checked public gift route.
  const adIds = [...new Set([...sends.map((s) => s.lead.adId), ...replies.map((r) => r.adId), ...signups.map((r) => r.adId), ...payments.map((r) => r.adId)].filter((x): x is string => !!x))].sort();
  const assets = adIds.length ? await prisma.adAsset.findMany({ where: { adId: { in: adIds }, mime: { startsWith: "image/" } }, orderBy: { createdAt: "asc" }, select: { id: true, adId: true } }) : [];
  const assetByAd = new Map<string, string>();
  for (const a of assets) if (!assetByAd.has(a.adId)) assetByAd.set(a.adId, a.id);
  const thumb = (giftToken: string | null, adId: string | null) => {
    const asset = adId ? assetByAd.get(adId) : undefined;
    return giftToken && asset ? `/api/ads/gift-public/${giftToken}/img/${asset}` : null;
  };

  const kly = beats.find((b) => b.id === "kly") ?? null;
  const codex = beats.find((b) => b.id === "provider:codex") ?? null;
  const heartbeat = freshness(kly?.updatedAt ?? null, now);
  const m = money({
    revenueMonthCents: month._sum.revenueCents ?? 0,
    revenueAllCents: allTime._sum.revenueCents ?? 0,
    payingCustomers: counts.paid,
    signups: counts.signedUp,
    costAllMicros: allTime._sum.costMicros ?? BigInt(0),
    costMonthMicros: month._sum.costMicros ?? BigInt(0),
  });
  const killSwitchOn = flag?.enabled ?? false;

  type Activity = { id: string; kind: "sent" | "reply" | "signup" | "paid"; at: Date; business: string; giftToken: string | null; thumb: string | null; qualityScore: number | null; detail: string | null };
  const activity: Activity[] = [
    ...sends.map((s): Activity => ({ id: `s-${s.id}`, kind: "sent", at: s.sentAt, business: s.lead.businessName, giftToken: s.lead.giftToken, thumb: thumb(s.lead.giftToken, s.lead.adId), qualityScore: s.lead.qualityScore, detail: [s.step > 1 ? "follow-up" : "first email", s.dryRun ? "dry run" : null, s.bounced ? "bounced" : null].filter(Boolean).join(" · ") })),
    ...replies.map((r): Activity => ({ id: `r-${r.id}`, kind: "reply", at: r.repliedAt ?? now, business: r.businessName, giftToken: r.giftToken, thumb: thumb(r.giftToken, r.adId), qualityScore: r.qualityScore, detail: [r.replyIntent?.replace(/_/g, " "), r.sends[0]?.replySnippet].filter(Boolean).join(": ") || null })),
    ...signups.map((r): Activity => ({ id: `u-${r.id}`, kind: "signup", at: r.signedUpAt ?? now, business: r.businessName, giftToken: r.giftToken, thumb: thumb(r.giftToken, r.adId), qualityScore: r.qualityScore, detail: null })),
    ...payments.map((r): Activity => ({ id: `p-${r.id}`, kind: "paid", at: r.paidAt ?? now, business: r.businessName, giftToken: r.giftToken, thumb: thumb(r.giftToken, r.adId), qualityScore: r.qualityScore, detail: r.revenueCents > 0 ? `$${(r.revenueCents / 100).toFixed(2)} so far` : null })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id)).slice(0, 24);

  return {
    now,
    settings,
    settingsUpdatedAt: settingsRow?.updatedAt ?? null,
    money: m,
    funnel: funnelSteps(counts),
    chart: dailySeries(daily, now),
    hasDaily: daily.length > 0,
    decisions: decisions.map((d) => ({ id: d.id, kind: d.kind, summary: d.summary, createdAt: d.createdAt })),
    arms: groupArms(arms),
    health: {
      heartbeat, heartbeatAt: kly?.updatedAt ?? null, heartbeatOk: kly?.ok ?? null, heartbeatMessage: kly?.message ?? null,
      outboundEnabled: metaFlag(kly?.meta, "outboundEnabled"),
      codex: codex ? { ok: codex.ok, message: codex.message, freshness: freshness(codex.updatedAt, now), at: codex.updatedAt } : null,
      budget: { spentCents: m.costMonthCents, budgetCents: settings.monthlyBudgetCents, ...budgetUse(m.costMonthCents, settings.monthlyBudgetCents) },
      killSwitchOn,
      // Detailed rows: the Gmail boxes plus any rented one that is paused or at risk (the rest are summarised in fleet/domains).
      mailboxes: mailboxHealth.filter((x) => x.provider === "gmail" || x.paused || x.risk).slice(0, 40),
      fleet,
      domains,
      warmup,
    },
    activity,
    voice,
    ozzy: ozzyLine({ weekSignups: weekly.signups, weekPaid: weekly.paid, weekRevenueCents: weekly.revenue, sentToday, mailboxes: mailboxes.length, heartbeat, enabled: settings.enabled && killSwitchOn }),
  };
}

export type KlyDashboard = Awaited<ReturnType<typeof loadKlyDashboard>>;
