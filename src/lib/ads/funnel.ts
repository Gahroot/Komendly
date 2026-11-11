// Pure funnel-by-source math for the admin (no I/O): landed -> signed up -> trial finished -> paid -> still paying,
// plus Meta spend economics per campaign. Callers pass rows + an explicit `now`.
import { isInternalEmail } from "@/lib/internal-email";
import type { FirstTouch } from "@/lib/analytics/first-touch";

const DAY_MS = 24 * 3600 * 1000;
const META_SOURCES = new Set(["facebook", "instagram", "meta", "fb", "ig", "messenger"]);

export type Channel = "meta_paid" | "blog" | "ref_link" | "gift" | "partner" | "referral" | "campaign" | "direct";
/** Growth loops: /r/<code> redirects with utm_source=referral and utm_medium referral | gift | partner. */
function loopChannel(t: FirstTouch): Channel | null {
  const src = t.utm_source?.toLowerCase();
  const med = t.utm_medium?.toLowerCase();
  if (src !== "referral" && src !== "gift" && src !== "partner") return null;
  if (src === "gift" || med === "gift") return "gift";
  if (src === "partner" || med === "partner") return "partner";
  return "ref_link";
}
export type SourceKey = { channel: Channel; source: string; campaign: string; content: string };
export type GroupBy = "channel" | "source" | "campaign" | "content";

/** Which bucket a touch belongs to: Meta paid (fbclid or utm_source facebook/instagram/meta), blog, other UTM, referral, direct. */
export function classifyTouch(t: FirstTouch | null | undefined): SourceKey {
  const source = t?.utm_source?.toLowerCase() ?? (t?.referrer ? t.referrer.toLowerCase() : "(direct)");
  const campaign = t?.utm_campaign ?? "(none)";
  const content = t?.utm_content ?? "(none)";
  let channel: Channel = "direct";
  if (t?.fbclid || (t?.utm_source && META_SOURCES.has(t.utm_source.toLowerCase()))) channel = "meta_paid";
  else if (t && loopChannel(t)) channel = loopChannel(t) ?? "campaign";
  else if (t?.utm_source === "blog" || t?.utm_medium === "blog" || t?.landing?.startsWith("/blog")) channel = "blog";
  else if (t?.utm_source || t?.utm_campaign) channel = "campaign";
  else if (t?.referrer) channel = "referral";
  return { channel, source, campaign, content };
}

export function groupKey(k: SourceKey, by: GroupBy): string {
  if (by === "channel") return k.channel;
  if (by === "source") return `${k.channel} · ${k.source}`;
  if (by === "campaign") return `${k.channel} · ${k.source} · ${k.campaign}`;
  return `${k.channel} · ${k.source} · ${k.campaign} · ${k.content}`;
}

/** `engaged`: the same visitor sent the engagement beacon (interacted or stayed 5 s) that day. */
export type VisitRow = { touch: FirstTouch | null; engaged?: boolean };

/** Ad review / crawler visits flagged by /api/ads/landed (props.bot) are not landings. */
export function isBotVisit(props: unknown): boolean {
  const b = (props as { bot?: unknown } | null)?.bot;
  return typeof b === "string" && b.length > 0;
}

export type PaymentEvent = { name: string; props: unknown; createdAt: Date };
const amountOf = (props: unknown): number => {
  const a = (props as { amountCents?: unknown } | null)?.amountCents;
  return typeof a === "number" ? a : 0;
};
/** Revenue-bearing payments: purchased (every checkout) + renewed; paid_converted only for history before `purchased` existed. */
export function revenuePayments<T extends PaymentEvent>(pays: readonly T[]): T[] {
  const p = pays.filter((x) => x.name === "purchased" || x.name === "renewed" || x.name === "paid_converted");
  return p.some((x) => x.name === "purchased") ? p.filter((x) => x.name !== "paid_converted") : p;
}
export function sumRevenueCents(pays: readonly PaymentEvent[]): number {
  return pays.reduce((t, p) => t + amountOf(p.props), 0);
}
export type SignupRow = {
  workspaceId: string;
  touch: FirstTouch | null;
  signedUpAt: Date;
  trialFinished: boolean;
  firstPaidAt: Date | null;
  /** Subscription end (null = still on it); only meaningful when subscribed. */
  canceledAt: Date | null;
  subscribed: boolean;
  currentlyActive: boolean;
  revenueCents: number;
  /** Revenue within 30 days of sign-up, and provider cost (USD micros) in the same window. */
  revenue30dCents: number;
  cost30dMicros: number;
};

export type FunnelRow = {
  key: string;
  landed: number;
  engaged: number;
  signedUp: number;
  trialFinished: number;
  paid: number;
  active30d: number;
  /** Paid customers 30+ days past first payment: the denominator of active30d. */
  eligible30d: number;
  activeNow: number;
  revenueCents: number;
  grossProfit30dCents: number;
  rates: { signup: number | null; trial: number | null; paid: number | null; active30d: number | null };
};

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** Paid, 30+ days past first payment, and still subscribed then (canceled later or not at all). */
export function activeAt30d(r: SignupRow, now: Date): { eligible: boolean; active: boolean } {
  if (!r.firstPaidAt || !r.subscribed) return { eligible: false, active: false };
  const day30 = r.firstPaidAt.getTime() + 30 * DAY_MS;
  if (day30 > now.getTime()) return { eligible: false, active: false };
  return { eligible: true, active: !r.canceledAt || r.canceledAt.getTime() > day30 };
}

function emptyRow(key: string): FunnelRow {
  return { key, landed: 0, engaged: 0, signedUp: 0, trialFinished: 0, paid: 0, active30d: 0, eligible30d: 0, activeNow: 0, revenueCents: 0, grossProfit30dCents: 0, rates: { signup: null, trial: null, paid: null, active30d: null } };
}

function addSignup(row: FunnelRow, s: SignupRow, now: Date): void {
  row.signedUp += 1;
  if (s.trialFinished) row.trialFinished += 1;
  if (s.firstPaidAt) row.paid += 1;
  const a = activeAt30d(s, now);
  if (a.eligible) row.eligible30d += 1;
  if (a.active) row.active30d += 1;
  if (s.currentlyActive) row.activeNow += 1;
  row.revenueCents += s.revenueCents;
  row.grossProfit30dCents += s.revenue30dCents - Math.round(s.cost30dMicros / 1e4);
}

function finish(row: FunnelRow): FunnelRow {
  row.rates = { signup: ratio(row.signedUp, row.landed), trial: ratio(row.trialFinished, row.signedUp), paid: ratio(row.paid, row.trialFinished), active30d: ratio(row.active30d, row.eligible30d) };
  return row;
}

/** Funnel per source group, sorted by sign-ups then landings (desc), key asc for ties. */
export function funnelBySource(visits: readonly VisitRow[], signups: readonly SignupRow[], by: GroupBy, now: Date): FunnelRow[] {
  const rows = new Map<string, FunnelRow>();
  const get = (k: string) => rows.get(k) ?? rows.set(k, emptyRow(k)).get(k) ?? emptyRow(k);
  for (const v of visits) {
    const r = get(groupKey(classifyTouch(v.touch), by));
    r.landed += 1;
    if (v.engaged) r.engaged += 1;
  }
  for (const s of signups) addSignup(get(groupKey(classifyTouch(s.touch), by)), s, now);
  return [...rows.values()].map(finish).sort((a, b) => b.signedUp - a.signedUp || b.landed - a.landed || a.key.localeCompare(b.key));
}

export function funnelTotal(rows: readonly FunnelRow[]): FunnelRow {
  const t = emptyRow("Total");
  for (const r of rows) {
    t.landed += r.landed;
    t.engaged += r.engaged;
    t.signedUp += r.signedUp;
    t.trialFinished += r.trialFinished;
    t.paid += r.paid;
    t.active30d += r.active30d;
    t.eligible30d += r.eligible30d;
    t.activeNow += r.activeNow;
    t.revenueCents += r.revenueCents;
    t.grossProfit30dCents += r.grossProfit30dCents;
  }
  return finish(t);
}

/** Monday (UTC) of the week containing `d`, as YYYY-MM-DD. */
export function weekStart(d: Date): string {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

/** Sign-up week cohorts (oldest first), each with the same funnel columns (landed = 0). */
export function cohortsByWeek(signups: readonly SignupRow[], now: Date): FunnelRow[] {
  const rows = new Map<string, FunnelRow>();
  for (const s of signups) {
    const k = weekStart(s.signedUpAt);
    const row = rows.get(k) ?? rows.set(k, emptyRow(k)).get(k) ?? emptyRow(k);
    addSignup(row, s, now);
  }
  return [...rows.values()].map(finish).sort((a, b) => a.key.localeCompare(b.key));
}

export type CampaignSpend = { campaignId: string; campaignName: string; spendCents: number; clicks: number; impressions: number };
export type CampaignEconomics = CampaignSpend & {
  signedUp: number;
  trialFinished: number;
  paid: number;
  grossProfit30dCents: number;
  cpcCents: number | null;
  costPerSignupCents: number | null;
  costPerTrialCents: number | null;
  cacCents: number | null;
  /** 30-day gross profit / spend (1 = paid back in 30 days); null without spend. */
  gp30ToCac: number | null;
};

const perUnit = (cents: number, n: number): number | null => (n > 0 ? Math.round(cents / n) : null);

/**
 * Join Meta spend to Meta-paid sign-ups by utm_campaign (matches campaign id or name, case-insensitive).
 * Campaigns with sign-ups but no spend row still appear (spend 0). Sorted by spend desc, name asc.
 */
export function campaignEconomics(spend: readonly CampaignSpend[], signups: readonly SignupRow[], now: Date): CampaignEconomics[] {
  const byKey = new Map<string, CampaignSpend>();
  for (const c of spend) {
    byKey.set(c.campaignId.toLowerCase(), c);
    byKey.set(c.campaignName.toLowerCase(), c);
  }
  const out = new Map<string, CampaignEconomics>();
  const row = (c: CampaignSpend) => out.get(c.campaignId) ?? out.set(c.campaignId, { ...c, signedUp: 0, trialFinished: 0, paid: 0, grossProfit30dCents: 0, cpcCents: null, costPerSignupCents: null, costPerTrialCents: null, cacCents: null, gp30ToCac: null }).get(c.campaignId);
  for (const c of spend) row(c);
  for (const s of signups) {
    const k = classifyTouch(s.touch);
    if (k.channel !== "meta_paid") continue;
    const c = byKey.get(k.campaign.toLowerCase()) ?? { campaignId: k.campaign, campaignName: k.campaign, spendCents: 0, clicks: 0, impressions: 0 };
    const r = row(c);
    if (!r) continue;
    const f = emptyRow("");
    addSignup(f, s, now);
    r.signedUp += f.signedUp;
    r.trialFinished += f.trialFinished;
    r.paid += f.paid;
    r.grossProfit30dCents += f.grossProfit30dCents;
  }
  return [...out.values()]
    .map((r) => ({
      ...r,
      cpcCents: perUnit(r.spendCents, r.clicks),
      costPerSignupCents: perUnit(r.spendCents, r.signedUp),
      costPerTrialCents: perUnit(r.spendCents, r.trialFinished),
      cacCents: perUnit(r.spendCents, r.paid),
      gp30ToCac: r.spendCents > 0 ? r.grossProfit30dCents / r.spendCents : null,
    }))
    .sort((a, b) => b.spendCents - a.spendCents || a.campaignName.localeCompare(b.campaignName));
}

export type AdSpend = { adId: string; adName: string; spendCents: number; impressions: number; linkClicks: number; ctr: number };
export type AdEconomics = AdSpend & { signedUp: number; trialFinished: number; paid: number; costPerSignupCents: number | null };

/**
 * Join Meta ad-level spend to Meta-paid sign-ups by utm_content (= ad id). Sign-ups whose ad isn't in `ads` are only
 * counted when `campaignId` matches their utm_campaign. Sorted by sign-ups, spend desc, then ad id.
 */
export function adEconomics(ads: readonly AdSpend[], signups: readonly SignupRow[], campaignId: string): AdEconomics[] {
  const out = new Map<string, AdEconomics>();
  for (const a of ads) out.set(a.adId, { ...a, signedUp: 0, trialFinished: 0, paid: 0, costPerSignupCents: null });
  for (const s of signups) {
    const k = classifyTouch(s.touch);
    if (k.channel !== "meta_paid" || k.content === "(none)") continue;
    let r = out.get(k.content);
    if (!r) {
      if (k.campaign !== campaignId) continue;
      r = { adId: k.content, adName: k.content, spendCents: 0, impressions: 0, linkClicks: 0, ctr: 0, signedUp: 0, trialFinished: 0, paid: 0, costPerSignupCents: null };
      out.set(k.content, r);
    }
    r.signedUp += 1;
    if (s.trialFinished) r.trialFinished += 1;
    if (s.firstPaidAt) r.paid += 1;
  }
  return [...out.values()]
    .map((r) => ({ ...r, costPerSignupCents: perUnit(r.spendCents, r.signedUp) }))
    .sort((a, b) => b.signedUp - a.signedUp || b.spendCents - a.spendCents || a.adId.localeCompare(b.adId));
}

// ---------------------------------------------------------------------------
// Ozzy Studio funnel (pure): signed up -> studio session -> message -> first render -> paywall/offer -> checkout -> paid.

/** Internal / test accounts never count (shared rule in src/lib/internal-email.ts). */
export function isFunnelTestEmail(email: string | null | undefined): boolean {
  return isInternalEmail(email);
}

export type StudioWorkspaceFacts = {
  workspaceId: string;
  sessionAt: Date | null;
  messageAt: Date | null;
  firstRenderAt: Date | null;
  paywallAt: Date | null;
  checkoutAt: Date | null;
  /** Payment times (purchased / paid_converted); paid counts only payments at/after the first render. */
  paymentsAt: readonly Date[];
};

export const STUDIO_FUNNEL_STEPS = [
  { key: "signedUp", label: "Signed up" },
  { key: "session", label: "Studio session" },
  { key: "message", label: "Message sent" },
  { key: "firstRender", label: "First render" },
  { key: "paywall", label: "Paywall / offer shown" },
  { key: "checkout", label: "Checkout" },
  { key: "paid", label: "Paid" },
] as const;
export type StudioFunnelStepKey = (typeof STUDIO_FUNNEL_STEPS)[number]["key"];
export type StudioFunnelStep = { key: StudioFunnelStepKey; label: string; count: number; fromPrev: number | null; fromStart: number | null };

/** Each step counts workspaces that reached it; % vs the previous step and vs sign-ups. */
export function studioFunnel(rows: readonly StudioWorkspaceFacts[]): StudioFunnelStep[] {
  const has: Record<StudioFunnelStepKey, (r: StudioWorkspaceFacts) => boolean> = {
    signedUp: () => true,
    session: (r) => !!r.sessionAt,
    message: (r) => !!r.messageAt,
    firstRender: (r) => !!r.firstRenderAt,
    paywall: (r) => !!r.paywallAt,
    checkout: (r) => !!r.checkoutAt,
    paid: (r) => !!r.firstRenderAt && r.paymentsAt.some((p) => p.getTime() >= (r.firstRenderAt as Date).getTime()),
  };
  const counts = STUDIO_FUNNEL_STEPS.map((s) => rows.filter(has[s.key]).length);
  const start = counts[0] ?? 0;
  return STUDIO_FUNNEL_STEPS.map((s, i) => {
    const count = counts[i] ?? 0;
    return { key: s.key, label: s.label, count, fromPrev: i === 0 ? null : ratio(count, counts[i - 1] ?? 0), fromStart: ratio(count, start) };
  });
}
