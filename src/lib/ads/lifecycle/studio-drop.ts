// "Ozzy Studio just dropped" drip (goal ezmotionkom): selection, copy facts, prompt, validator and fallback copy.
// Pure + raw-SQL loader; shared by the engine (sends) and tests. No package imports (the engine imports this file).
// Kill switches: AdsFeatureFlag lifecycle_email AND studio_drop (default off). Same suppression as the lifecycle
// emails: unsubscribes, LIFECYCLE_EXCLUDE / internal domains (isTestEmail), suspended workspaces.
import { ADS_GUARANTEE, ADS_PLANS, ADS_TOPUPS, LAUNCH_QUARTER, offerFirstPaymentCents } from "../billing-config";
import { STUDIO_LAUNCH_OFFER } from "../../hub/money-model";
import { STUDIO_INVITE, STUDIO_MAX_SECONDS, STUDIO_PRICE, STUDIO_STARTERS, STUDIO_UPLOAD_LIMITS } from "../../studio/contracts";
import type { EmailCopy } from "./copy";
import { isTestEmail, lastCappedSendAt, MIN_GAP_MS, spreadSlot, TRANSACTIONAL_KINDS } from "./select";

export const STUDIO_DROP_FLAG = "studio_drop";
export const STUDIO_DROP_KINDS = [
  "studio_d0", "studio_d2", "studio_d5", "studio_ready", "studio_last24", "studio_invite_reward",
  // Trial users (free Ad Pack): replace the generic D0. Unpaid after the Launch Quarter closed -> "second wow" (their
  // best ad -> a Studio video); paid -> "included in your plan" (no free-video pitch, no launch offer).
  "studio_second_wow", "studio_included",
] as const;
export type StudioDropKind = (typeof STUDIO_DROP_KINDS)[number];

const H = 3_600_000;
const D = 24 * H;
/** D0 trickles out over 48h after the start (hash of the user id); open for 14 days. */
export const STUDIO_DROP = { spreadHours: 48, openDays: 14, newUserDelayHours: 24, inviteLookbackDays: 3, secondWowAfterHours: 24, includedAfterHours: 48 } as const;
/** The intro emails (exactly one of them per user). */
const INTRO_KINDS = ["studio_d0", "studio_second_wow", "studio_included"] as const;

/** Start of the announcement: LIFECYCLE_STUDIO_DROP_START (ISO) or the moment the studio_drop flag was switched on. */
export function studioDropStart(flagUpdatedAt: Date, env: string | undefined): Date {
  const d = env ? new Date(env) : null;
  return d && Number.isFinite(d.getTime()) ? d : flagUpdatedAt;
}

export interface StudioDropCandidate {
  userId: string;
  email: string;
  name: string | null;
  signedUpAt: Date;
  /** Verified email, or a paying customer of any product (real inbox). Unverified free sign-ups are skipped. */
  contactable: boolean;
  /** Paying for anything (ads plan/purchase, testimonial plan/pack): copy thanks them, no launch-offer pitch. */
  paid: boolean;
  /** Ads workspace on a paid plan: the Studio launch offer doesn't apply. */
  paidWorkspace: boolean;
  /** Uses testimonials (legacy plan or pack): copy angle. */
  testimonialsUser: boolean;
  unsubscribed: boolean;
  suspended: boolean;
  workspaceId: string | null;
  studioSessions: number;
  freeVideosLeft: number;
  /** First free Studio video delivered (AdsWorkspace.studioOfferReadyAt): starts the 72h launch offer. */
  firstFreeVideoAt: Date | null;
  /** Last NON-transactional lifecycle email of any sequence (see TRANSACTIONAL_KINDS); drives the 24h cap. */
  lastEmailAt: Date | null;
  /** Studio emails (all time) + recent/offer emails of the trial sequence (offer_24h, last_chance...). */
  sent: Array<{ kind: string; at: Date; inviteId?: string | null }>;
  /** The workspace's free Ad Pack trial (first finished trial run); absent = never ran the trial. */
  trial?: { runId: string; completedAt: Date; readyAdCount: number; paidAt: Date | null } | null;
  /** Invites of this sender that earned the +1 reward (StudioInvite.rewardedAt). */
  rewards: Array<{ inviteId: string; rewardedAt: Date }>;
}

export interface StudioDue {
  kind: StudioDropKind;
  inviteId?: string;
}

export function studioDropSuppressed(c: StudioDropCandidate, exclude?: string): "test_user" | "unsubscribed" | "not_contactable" | "suspended" | null {
  if (isTestEmail(c.email, exclude)) return "test_user";
  if (c.unsubscribed) return "unsubscribed";
  if (c.suspended) return "suspended";
  if (!c.contactable) return "not_contactable";
  return null;
}

const sentAt = (c: StudioDropCandidate, kind: string) => c.sent.find((s) => s.kind === kind)?.at ?? null;
const inWin = (now: Date, from: number, until: number) => now.getTime() >= from && now.getTime() < until;

export type StudioSegment = "trial_unpaid" | "trial_paid" | "generic";
/** Which Studio path a user is on: free Ad Pack trial users follow the money sequence; everyone else the generic drop. */
export function studioSegment(c: StudioDropCandidate): StudioSegment {
  if (!c.trial) return "generic";
  return c.paidWorkspace || c.trial.paidAt ? "trial_paid" : "trial_unpaid";
}

/** End of the 72h Launch Quarter window (trial ads ready + 72h); null = no trial. */
export function launchQuarterClosesAt(c: StudioDropCandidate): Date | null {
  return c.trial ? new Date(c.trial.completedAt.getTime() + LAUNCH_QUARTER.windowHours * H) : null;
}
export function launchQuarterOpen(c: StudioDropCandidate, now: Date): boolean {
  const close = launchQuarterClosesAt(c);
  return Boolean(c.trial && close && now.getTime() >= (c.trial.completedAt.getTime()) && now < close);
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10);
/**
 * Why no NON-transactional Studio email may go now (null = clear): the LQ window is open, another lifecycle email went
 * out in the last 24h, or today the trial's offer_24h / last_chance went out.
 */
export function studioQuietReason(c: StudioDropCandidate, now: Date): "launch_quarter_open" | "recent_email" | "offer_day" | null {
  if (launchQuarterOpen(c, now)) return "launch_quarter_open";
  if (c.sent.some((s) => (s.kind === "offer_24h" || s.kind === "last_chance") && utcDay(s.at) === utcDay(now))) return "offer_day";
  const last = Math.max(c.lastEmailAt?.getTime() ?? 0, lastCappedSendAt(c.sent));
  if (last && now.getTime() - last < MIN_GAP_MS) return "recent_email";
  return null;
}

/** When the user's Studio intro may go out, and which one. */
export function studioIntro(c: StudioDropCandidate, start: Date): { kind: (typeof INTRO_KINDS)[number]; from: number } | null {
  const spread = Math.max(start.getTime() + spreadSlot(c.userId, STUDIO_DROP.spreadHours) * H, c.signedUpAt.getTime() + STUDIO_DROP.newUserDelayHours * H);
  const seg = studioSegment(c);
  if (seg === "trial_paid") {
    // A plan already covers Studio: say so (even if they tried Studio on the free video), 2 days after buying.
    const paidAt = c.trial?.paidAt?.getTime() ?? start.getTime();
    return { kind: "studio_included", from: Math.max(spread, paidAt + STUDIO_DROP.includedAfterHours * H) };
  }
  // Someone who already made their free video doesn't need the announcement.
  if (c.firstFreeVideoAt !== null) return null;
  const close = launchQuarterClosesAt(c);
  if (seg === "trial_unpaid" && close) {
    const lastChance = sentAt(c, "last_chance")?.getTime() ?? 0;
    const from = Math.max(spread, Math.max(close.getTime(), lastChance) + STUDIO_DROP.secondWowAfterHours * H);
    // "Second wow" needs their ads and an unused free video (the copy promises it); else the generic D0 after the window.
    return c.trial && c.trial.readyAdCount > 0 && c.freeVideosLeft > 0 ? { kind: "studio_second_wow", from } : { kind: "studio_d0", from };
  }
  return { kind: "studio_d0", from: spread };
}

/** The one Studio drop email due now (null = none). Priority: transactional first, then offer, then intro + follow-ups. */
export function dueStudioEmail(c: StudioDropCandidate, now: Date, start: Date, exclude?: string): StudioDue | null {
  if (studioDropSuppressed(c, exclude) || now < start) return null;
  const r = c.firstFreeVideoAt?.getTime();
  const offerWin = STUDIO_LAUNCH_OFFER.windowHours * H;
  const recentVideo = r !== undefined && r >= start.getTime() - 7 * D;
  // Transactional (no cap): "your video is ready" right after their own render (no offer pitch while LQ is open: see
  // studioOfferOpen) and the invite reward.
  if (recentVideo && !sentAt(c, "studio_ready") && inWin(now, r, r + 12 * H)) return { kind: "studio_ready" };
  const since = now.getTime() - STUDIO_DROP.inviteLookbackDays * D;
  for (const rw of [...c.rewards].sort((a, b) => a.rewardedAt.getTime() - b.rewardedAt.getTime() || a.inviteId.localeCompare(b.inviteId))) {
    if (rw.rewardedAt.getTime() >= since && rw.rewardedAt <= now && !c.sent.some((s) => s.kind === "studio_invite_reward" && s.inviteId === rw.inviteId)) return { kind: "studio_invite_reward", inviteId: rw.inviteId };
  }
  // Studio launch-offer deadline: never while the LQ window is open (one offer at a time; LQ wins), never on an LQ
  // offer day; like the trial's last_chance it is a real deadline, so the 24h cap does not hold it back.
  if (recentVideo && !c.paidWorkspace && !sentAt(c, "studio_last24") && inWin(now, r + offerWin - 24 * H, r + offerWin - 2 * H)) {
    const q = studioQuietReason(c, now);
    return q === null || q === "recent_email" ? { kind: "studio_last24" } : null;
  }
  if (studioQuietReason(c, now)) return null;
  const introSent = INTRO_KINDS.map((k) => ({ k, at: sentAt(c, k) })).find((x) => x.at);
  if (!introSent) {
    const intro = studioIntro(c, start);
    return intro && inWin(now, intro.from, Math.max(intro.from, start.getTime()) + STUDIO_DROP.openDays * D) ? { kind: intro.kind } : null;
  }
  // Follow-ups only on the generic path: trial users get Studio as a P.S. in day7/day10 instead (no competing CTA).
  if (introSent.k !== "studio_d0" || studioSegment(c) !== "generic" || !introSent.at) return null;
  const t = introSent.at.getTime();
  if (!sentAt(c, "studio_d2") && c.studioSessions === 0 && inWin(now, t + 2 * D, t + 4 * D)) return { kind: "studio_d2" };
  if (!sentAt(c, "studio_d5") && c.freeVideosLeft > 0 && c.firstFreeVideoAt === null && inWin(now, t + 5 * D, t + 7 * D)) return { kind: "studio_d5" };
  return null;
}

/** Studio launch offer may be pitched: its own 72h window, not on a paid plan, and the LQ window is not open. */
export function studioOfferOpen(c: StudioDropCandidate, now: Date): boolean {
  if (c.paidWorkspace || launchQuarterOpen(c, now) || !c.firstFreeVideoAt) return false;
  const t = now.getTime() - c.firstFreeVideoAt.getTime();
  return t >= 0 && t < STUDIO_LAUNCH_OFFER.windowHours * H;
}

/** path + UTM params, kept BEFORE any #fragment (else the anchor becomes "studio-bridge?utm..." and doesn't scroll). */
export function withUtm(path: string, kind: string): string {
  const i = path.indexOf("#");
  const [p, frag] = i < 0 ? [path, ""] : [path.slice(0, i), path.slice(i)];
  return `${p}${p.includes("?") ? "&" : "?"}utm_source=email&utm_medium=lifecycle&utm_campaign=${kind}${frag}`;
}

/** Studio bridge on the run page (the "Make this a video with Ozzy" card). */
export function studioBridgePath(runId: string): string {
  return `/ads/runs/${encodeURIComponent(runId)}#studio-bridge`;
}

/** P.S. line for the trial's day7_downsell / day10_free_ads (one quiet link, under the main CTA). null = none. */
export function studioPsFor(kind: string, o: { runId: string | null; studioLive: boolean; madeStudioVideo: boolean }): { text: string; linkLabel: string; path: string } | null {
  if (!o.studioLive || !o.runId || o.madeStudioVideo || (kind !== "day7_downsell" && kind !== "day10_free_ads")) return null;
  return { text: "P.S. Ozzy can now turn one of your ads into a short video. Your first Studio video is free, no card.", linkLabel: "Make one of my ads a video", path: studioBridgePath(o.runId) };
}

// ---------- copy ----------

export interface StudioCopyContext {
  kind: StudioDropKind;
  firstName: string | null;
  paid: boolean;
  testimonialsUser: boolean;
  /** studio_ready / studio_last24: launch offer still open (and not on a paid plan). */
  offerOpen: boolean;
  offerClosesAt: Date | null;
  freeVideosLeft: number;
  /** studio_second_wow / studio_included: the trial run (bridge link) and brand name. */
  runId?: string | null;
  brandName?: string | null;
}

const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const growth = ADS_PLANS.find((p) => p.key === STUDIO_LAUNCH_OFFER.plan);
const starter = ADS_PLANS.find((p) => p.key === "starter");
const topup = ADS_TOPUPS.find((t) => t.key === "topup_10");

/** Fixed subjects (the brief's lines); the AI writes the body only. */
export const STUDIO_SUBJECTS: Record<StudioDropKind, string> = {
  studio_d0: "Ozzy Studio is here: your first video is free",
  studio_d2: "Bring a clip, Ozzy edits it",
  studio_d5: "Your free video expires never, but...",
  studio_ready: "Your video is ready",
  studio_last24: "Last 24h: your Ozzy Studio launch offer",
  studio_invite_reward: "A friend joined: +1 free video",
  studio_second_wow: "Your ads, now as a video",
  studio_included: "Ozzy Studio is included in your plan",
};
/** Fixed-copy kinds (no AI body): they sit next to the money sequence, so every word is reviewed. */
export const STUDIO_FIXED_COPY: ReadonlySet<StudioDropKind> = new Set(["studio_second_wow", "studio_included"]);

export const STUDIO_FACTS = {
  what: "Ozzy Studio is new in Komendly: they chat with Ozzy like a message to a friend, and he plans, builds and renders a video ad or motion graphic for them. They can ask for changes in the same chat.",
  free: `Every account gets 1 free Studio video (up to ${STUDIO_MAX_SECONDS.free}s, no watermark), including ${STUDIO_PRICE.includedRevisions} revisions. No card needed.`,
  footage: `They can upload their own clips (video, images or audio, up to ${STUDIO_UPLOAD_LIMITS.maxBytesFree / 1024 / 1024} MB on the free video) and Ozzy cuts them into an ad with captions and music, or adds captions and tightens the pauses.`,
  invite: `Give a friend ${STUDIO_INVITE.friendFreeVideos} free Studio videos with their invite link in Ozzy Studio; they get ${STUDIO_INVITE.senderRewardVideos} more free video when the friend joins (up to ${STUDIO_INVITE.maxRewardsPerMonth} a month).`,
  noExpiry: "The free video never expires. Be honest: there is no deadline on it.",
  credits: `Paid plans use Ozzy credits, one wallet for Ad Packs and Studio: a new Studio video is ${STUDIO_PRICE.newShort} credits (${STUDIO_PRICE.newLong} if longer than ${STUDIO_PRICE.longOverSeconds}s).`,
  offer: growth ? `${STUDIO_LAUNCH_OFFER.name}: the ${growth.name} plan (their AI ad department: unlimited Studio videos and Ad Packs made one at a time, 6 fresh ads every Monday, Ozzy Ad Coach, own footage up to ${STUDIO_MAX_SECONDS.paid}s), first month ${usd(offerFirstPaymentCents(LAUNCH_QUARTER))} instead of ${usd(growth.priceCents)}, then ${usd(growth.priceCents)}/month. Only open for ${STUDIO_LAUNCH_OFFER.windowHours} hours after their first free video. ${ADS_GUARANTEE}` : "",
  downsell: starter && topup ? `Smaller options that stay available: ${starter.name} at ${usd(starter.priceCents)}/month, or ${topup.name} once for ${usd(topup.priceCents)}.` : "",
  testimonials: "They already use Komendly for AI testimonial videos. Studio is a separate new app in the same account.",
  linksBelow: "Starter prompts or links are shown as buttons under your text: refer to them, never write URLs.",
};

/** Invite block text under the D5 email. */
export const STUDIO_INVITE_SAFE = `Your friend gets ${STUDIO_INVITE.friendFreeVideos} free Ozzy Studio videos; you get ${STUDIO_INVITE.senderRewardVideos} more when they join (up to ${STUDIO_INVITE.maxRewardsPerMonth} a month). Tap the "Give 2 free videos" button in Ozzy Studio.`;

export const STUDIO_ALLOWED_PRICES = new Set([usd(offerFirstPaymentCents(LAUNCH_QUARTER)), ...ADS_PLANS.map((p) => usd(p.priceCents)), ...ADS_TOPUPS.map((t) => usd(t.priceCents))]);

const STAGE: Record<StudioDropKind, string> = {
  studio_d0: "Announcement: Ozzy Studio just launched and their first video is free. Goal: get them to open Studio and send a first message. Mention the starter prompts below. No prices.",
  studio_d2: "Two days after the announcement and they have not opened Studio. Angle: footage editing: bring a clip from their phone and Ozzy edits it into an ad. Goal: open Studio and upload a clip. No prices.",
  studio_d5: "Five days after the announcement; their free video is still unused. Be honest: it never expires, so there is no rush. Give one reason to use it this week anyway (e.g. a simple idea for their business), then the invite angle: give a friend 2 free videos. No prices, no fake urgency.",
  studio_ready: "Their first free Studio video just finished. Goal: get them to watch it. If FACTS include the launch offer, mention it briefly with its real 72-hour window and the guarantee; otherwise just suggest a revision or a next video.",
  studio_last24: "The Studio launch offer closes in about 24 hours (real deadline). Calm, clear reminder with the real price, the bonus and the guarantee; mention the smaller options that stay available after.",
  studio_second_wow: "Fixed copy.",
  studio_included: "Fixed copy.",
  studio_invite_reward: "A friend they invited just joined Ozzy Studio, so they earned 1 more free Studio video. Thank them and get them to use it. Mention they can keep inviting. No prices.",
};

export const STUDIO_COPY_SYSTEM = `You write short, plain, warm emails from Ozzy, Komendly's friendly wizard (a dingo, Australian but never gimmicky). First person as Ozzy is fine.
Hard rules:
- Truthful only. Use ONLY the facts given. Never invent results, stats, testimonials, discounts, deadlines, bonuses or features.
- Prices: only the exact prices given in FACTS. No percentages, no coupons.
- No links or URLs in the text (buttons are added for you). No emojis. No ALL CAPS.
- Total words across paragraphs: at most 110. 2 to 4 short paragraphs; the first is a greeting line using the first name if given.
- Never create urgency that isn't in FACTS.`;

export function buildStudioCopyPrompt(ctx: StudioCopyContext, now: Date): string {
  const left = ctx.offerClosesAt ? Math.max(0, Math.round((ctx.offerClosesAt.getTime() - now.getTime()) / H)) : null;
  const facts = [
    STUDIO_FACTS.what,
    ...(ctx.kind === "studio_d0" ? [STUDIO_FACTS.free, STUDIO_FACTS.footage, STUDIO_FACTS.linksBelow] : []),
    ...(ctx.kind === "studio_d2" ? [STUDIO_FACTS.footage, STUDIO_FACTS.free] : []),
    ...(ctx.kind === "studio_d5" ? [STUDIO_FACTS.free, STUDIO_FACTS.noExpiry, STUDIO_FACTS.invite, STUDIO_FACTS.linksBelow] : []),
    ...(ctx.kind === "studio_ready" ? [STUDIO_FACTS.credits, ...(ctx.offerOpen ? [STUDIO_FACTS.offer] : [])] : []),
    ...(ctx.kind === "studio_last24" ? [STUDIO_FACTS.offer, STUDIO_FACTS.downsell] : []),
    ...(ctx.kind === "studio_invite_reward" ? [STUDIO_FACTS.invite, `They now have ${ctx.freeVideosLeft} free Studio video${ctx.freeVideosLeft === 1 ? "" : "s"} left.`] : []),
    ...(left !== null && ctx.offerOpen ? [`The launch offer closes in about ${left} hours.`] : []),
    ...(ctx.testimonialsUser ? [STUDIO_FACTS.testimonials] : []),
    ctx.paid ? "They are a paying Komendly customer: thank them." : "",
  ].filter(Boolean);
  return `EMAIL: ${ctx.kind}\nSUBJECT (fixed): ${STUDIO_SUBJECTS[ctx.kind]}\nSTAGE: ${STAGE[ctx.kind]}\nFACTS:\n- ${facts.join("\n- ")}\nUSER: <untrusted>${JSON.stringify({ firstName: ctx.firstName })}</untrusted>\nReturn JSON {subject, preheader (<= 90 chars), paragraphs (2-4 strings), ctaLabel (<= 28 chars)}.`;
}

const OFFER_RE = /\bbonus\b|launch offer|\$119|\$97\b|\$197|\bgrowth\b|ad department/i;
const URGENCY_RE = /\bhurry\b|last chance|limited time|act now|ends (soon|today|tonight)|\bonly \d+ (hours?|days?) left\b|before it'?s gone/i;

/** null = acceptable; else why the AI copy is rejected (caller falls back). */
export function checkStudioCopy(c: EmailCopy, ctx: StudioCopyContext): string | null {
  if (c.paragraphs.length < 2 || c.paragraphs.length > 4) return "paragraph count";
  if (c.paragraphs.join(" ").split(/\s+/).filter(Boolean).length > 120) return "too long";
  if (!c.ctaLabel.trim() || c.ctaLabel.length > 28) return "cta label";
  const all = [c.preheader, c.ctaLabel, ...c.paragraphs].join("\n");
  if (/https?:\/\/|www\./i.test(all)) return "contains a link";
  if (/%|\bcoupon\b|\bpromo code\b|\bdiscount\b/i.test(all)) return "invented discount";
  for (const m of all.match(/\$\d[\d,]*(\.\d\d)?/g) ?? []) if (!STUDIO_ALLOWED_PRICES.has(m.replace(/,/g, ""))) return `unknown price ${m}`;
  const offerKind = ctx.kind === "studio_last24" || (ctx.kind === "studio_ready" && ctx.offerOpen);
  if (!offerKind && OFFER_RE.test(all)) return "mentions the launch offer";
  if (ctx.kind !== "studio_last24" && URGENCY_RE.test(all)) return "fake urgency";
  if (/\b\d{2,}\s*(\+\s*)?(businesses|customers|brands|users|companies)\b/i.test(all)) return "invented social proof";
  return null;
}

/** Fixed copy used when the AI is unavailable or its output fails validation. */
export function studioFallbackCopy(ctx: StudioCopyContext, now: Date): EmailCopy {
  const hi = `G'day ${ctx.firstName ?? "there"},`;
  const subject = STUDIO_SUBJECTS[ctx.kind];
  const left = ctx.offerClosesAt ? Math.max(0, Math.round((ctx.offerClosesAt.getTime() - now.getTime()) / H)) : 24;
  const g = growth ? `${growth.name} at ${usd(growth.priceCents)}/month` : "Growth";
  const thanks = ctx.paid ? " Thanks for being a Komendly customer." : "";
  switch (ctx.kind) {
    case "studio_d0":
      return {
        subject,
        preheader: "Tell Ozzy what you want. He makes the video.",
        paragraphs: [hi, `Something new${thanks ? " (and thanks for being a Komendly customer)" : ""}: Ozzy Studio. You chat with me like you'd text a friend, and I plan, build and render a video ad or motion graphic for you.`, `Your first video is free (up to ${STUDIO_MAX_SECONDS.free}s, ${STUDIO_PRICE.includedRevisions} changes included). Got clips? Upload them and I'll cut them into an ad. Pick a starter below or write your own.`],
        ctaLabel: "Make my free video",
      };
    case "studio_d2":
      return {
        subject,
        preheader: "Upload a clip from your phone. Ozzy cuts it into an ad.",
        paragraphs: [hi, "No idea where to start? Bring a clip. Anything from your phone works: a product shot, your shop, you talking to camera.", "Upload it in Ozzy Studio and I'll cut it into an ad with captions and music, or tidy it up and tighten the pauses. Your first video is free."],
        ctaLabel: "Upload a clip",
      };
    case "studio_d5":
      return {
        subject,
        preheader: "No deadline on it. Here's an easy first idea anyway.",
        paragraphs: [hi, "Honest truth: your free Ozzy Studio video never expires. No countdown, no catch.", "But the easiest first one takes a minute: ask me for a 15-second promo from your website, and see what comes back.", `Know someone who'd like one too? Give a friend ${STUDIO_INVITE.friendFreeVideos} free videos from Studio, and you get ${STUDIO_INVITE.senderRewardVideos} more when they join.`],
        ctaLabel: "Use my free video",
      };
    case "studio_ready":
      return ctx.offerOpen
        ? {
            subject,
            preheader: `Watch it now. Plus your first month for ${usd(offerFirstPaymentCents(LAUNCH_QUARTER))} if you keep going this week.`,
            paragraphs: [hi, `Your first Ozzy Studio video is done. Have a look, and ask me for changes in the same chat: ${STUDIO_PRICE.includedRevisions} are included.`, `Want to keep me on your team? For the next ${STUDIO_LAUNCH_OFFER.windowHours} hours, your first month of ${g} is ${usd(offerFirstPaymentCents(LAUNCH_QUARTER))}. ${ADS_GUARANTEE}`],
            ctaLabel: "Watch my video",
          }
        : {
            subject,
            preheader: "Watch it, then ask Ozzy for changes.",
            paragraphs: [hi, `Your Ozzy Studio video is done. Have a look, and ask me for changes in the same chat: ${STUDIO_PRICE.includedRevisions} are included.`, "When you're ready, tell me what the next one should be."],
            ctaLabel: "Watch my video",
          };
    case "studio_last24":
      return {
        subject,
        preheader: `${g}, first month ${usd(offerFirstPaymentCents(LAUNCH_QUARTER))}, about ${left} hours left.`,
        paragraphs: [hi, `A heads-up: the ${STUDIO_LAUNCH_OFFER.name} offer closes in about ${left} hours. It's ${g}, your first month for ${usd(offerFirstPaymentCents(LAUNCH_QUARTER))}.`, ADS_GUARANTEE, starter && topup ? `Prefer something smaller? ${starter.name} at ${usd(starter.priceCents)}/month or ${topup.name} for ${usd(topup.priceCents)} stay available after.` : "The smaller options stay available after."],
        ctaLabel: "See the offer",
      };
    case "studio_second_wow":
      return {
        subject,
        preheader: "One tap turns your best ad into a short video. First one's free.",
        paragraphs: [
          hi,
          `The ads I made${ctx.brandName ? ` for ${ctx.brandName}` : " for you"} work great as stills. Now they can move too.`,
          `Tap below and I'll turn your best one into a short video ad in Ozzy Studio, starting from the ad itself. You can ask me for changes in the same chat (${STUDIO_PRICE.includedRevisions} included).`,
          `Your first Studio video is free, no card needed, and no watermark.`,
        ],
        ctaLabel: "Make this ad a video",
      };
    case "studio_included":
      return {
        subject,
        preheader: "Make video ads by chatting with Ozzy. It runs on the credits you already have.",
        paragraphs: [
          hi,
          "Thanks for joining. Your plan now includes Ozzy Studio: tell me what you want, and I plan, build and render a video ad or motion graphic for you. You can bring your own clips too.",
          `It uses the same credits as your ads: a new video is ${STUDIO_PRICE.newShort} credits (${STUDIO_PRICE.newLong} if longer than ${STUDIO_PRICE.longOverSeconds}s), ${STUDIO_PRICE.includedRevisions} changes included, no watermark.`,
        ],
        ctaLabel: "Open Ozzy Studio",
      };
    case "studio_invite_reward":
      return {
        subject,
        preheader: "Your friend joined Ozzy Studio. Your extra video is in.",
        paragraphs: [hi, `A friend you invited just joined Ozzy Studio, so I added ${STUDIO_INVITE.senderRewardVideos} free video to your account. You have ${ctx.freeVideosLeft} free video${ctx.freeVideosLeft === 1 ? "" : "s"} now.`, `Keep sharing your invite: each friend gets ${STUDIO_INVITE.friendFreeVideos} free videos, and you get one more when they join (up to ${STUDIO_INVITE.maxRewardsPerMonth} a month).`],
        ctaLabel: "Make a video",
      };
  }
}

/** App path of each email's main button. */
export function studioCtaPath(kind: StudioDropKind, runId?: string | null): string {
  if (kind === "studio_last24") return "/ads/billing";
  if (kind === "studio_second_wow" && runId) return studioBridgePath(runId);
  if (kind === "studio_d2") return `/studio?prompt=${encodeURIComponent(STUDIO_STARTERS.find((s) => s.id === "edit")?.prompt ?? "")}&starter=edit`;
  return "/studio";
}

/** D0 starter prompts (deep links into Studio). */
export function studioStarterLinks(): Array<{ text: string; linkLabel: string; href: string }> {
  return STUDIO_STARTERS.filter((s) => ["promo", "edit", "logo", "testimonial"].includes(s.id)).map((s) => ({ text: s.title, linkLabel: "Start with this", href: `/studio?prompt=${encodeURIComponent(s.prompt)}&starter=${s.id}` }));
}

// ---------- loader (raw SQL; works on the web's and the engine's Prisma clients) ----------

export interface RawQueryDb {
  $queryRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
}
type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const date = (v: unknown): Date | null => (v instanceof Date ? v : typeof v === "string" ? new Date(v) : null);
const PAID_WS = ["active", "trialing", "past_due"];
const LEGACY = ["starter", "pro", "enterprise"];

/** Every user (ads + testimonials), with what the Studio drip needs. `userIds` narrows (ops/tests). */
export async function loadStudioDropCandidates(db: RawQueryDb, now: Date, userIds?: string[]): Promise<StudioDropCandidate[]> {
  const users = rows(
    await db.$queryRawUnsafe(
      `SELECT u.id, u.email, u.name, u."createdAt", u."emailVerifiedAt", u.plan::text AS plan, u."subscriptionStatus"::text AS "subStatus",
              EXISTS (SELECT 1 FROM "CreditPurchase" c WHERE c."userId" = u.id AND c."amountPaid" > 0) AS "boughtTesti",
              w.id AS "workspaceId", w."adsPlan", w."subscriptionStatus" AS "wsStatus", w."suspendedAt", w."studioFreeVideos", w."studioOfferReadyAt"
         FROM "User" u
         LEFT JOIN LATERAL (SELECT * FROM "AdsWorkspace" x WHERE x."ownerId" = u.id ORDER BY x."createdAt" ASC LIMIT 1) w ON true
        WHERE ($1::text[] IS NULL OR u.id = ANY($1::text[]))
          AND NOT EXISTS (SELECT 1 FROM "AdsEvent" e WHERE e.name = 'email_unsubscribed' AND e."userId" = u.id)`,
      userIds ?? null,
    ),
  );
  if (!users.length) return [];
  const uids = users.map((u) => String(u.id));
  const since = new Date(now.getTime() - STUDIO_DROP.inviteLookbackDays * D);
  const wids = users.map((u) => str(u.workspaceId)).filter((w): w is string => Boolean(w));
  const recent = new Date(now.getTime() - 3 * D);
  const [sessions, last, sent, paidEv, invites, trials] = await Promise.all([
    db.$queryRawUnsafe(`SELECT "userId", count(*)::int AS n FROM "StudioSession" WHERE "userId" = ANY($1::text[]) GROUP BY "userId"`, uids),
    // Last capped (non-transactional) lifecycle email of ANY sequence: the shared 24h frequency cap.
    db.$queryRawUnsafe(`SELECT "userId", max("createdAt") AS at FROM "AdsEvent" WHERE name = 'email_sent' AND "userId" = ANY($1::text[]) AND COALESCE(props->>'kind', '') <> ALL($2::text[]) GROUP BY "userId"`, uids, [...TRANSACTIONAL_KINDS]),
    db.$queryRawUnsafe(`SELECT "userId", props->>'kind' AS kind, props->>'inviteId' AS "inviteId", "createdAt" FROM "AdsEvent" WHERE name = 'email_sent' AND "userId" = ANY($1::text[]) AND (props->>'kind' LIKE 'studio\\_%' OR props->>'kind' IN ('offer_24h', 'last_chance') OR "createdAt" >= $2)`, uids, recent),
    db.$queryRawUnsafe(`SELECT "userId", "workspaceId", min("createdAt") AS at FROM "AdsEvent" WHERE name IN ('purchased', 'paid_converted') AND ("userId" = ANY($1::text[]) OR "workspaceId" = ANY($2::text[])) GROUP BY "userId", "workspaceId"`, uids, wids),
    db.$queryRawUnsafe(`SELECT id, "senderUserId", "rewardedAt" FROM "StudioInvite" WHERE "rewardedAt" >= $1 AND "senderUserId" = ANY($2::text[])`, since, uids),
    // Same trial run as the lifecycle loader (first finished trial run; ready FREE ads only).
    db.$queryRawUnsafe(
      `SELECT DISTINCT ON (r."workspaceId") r.id, r."workspaceId", r."completedAt",
              (SELECT count(*) FROM "Ad" a WHERE a."runId" = r.id AND a.status::text = 'ready'
                 AND COALESCE(a."visualBrief"->>'locked', 'false') <> 'true')::int AS ready
         FROM "AdRun" r
        WHERE r."workspaceId" = ANY($1::text[]) AND r."isTrial" AND r."completedAt" IS NOT NULL
          AND r.status::text IN ('completed', 'partial')
        ORDER BY r."workspaceId", r."completedAt" ASC`,
      wids,
    ),
  ]);
  const trialBy = new Map(rows(trials).map((r) => [String(r.workspaceId), r]));
  const paidAtBy = new Map<string, Date>();
  for (const r of rows(paidEv)) {
    const at = date(r.at);
    if (!at) continue;
    for (const k of [str(r.userId), str(r.workspaceId)]) if (k && (!paidAtBy.has(k) || (paidAtBy.get(k)?.getTime() ?? 0) > at.getTime())) paidAtBy.set(k, at);
  }
  const nSessions = new Map(rows(sessions).map((r) => [String(r.userId), Number(r.n ?? 0)]));
  const lastAt = new Map(rows(last).map((r) => [String(r.userId), date(r.at)]));
  const paidUsers = new Set(rows(paidEv).map((r) => String(r.userId)));
  const sentBy = new Map<string, StudioDropCandidate["sent"]>();
  for (const r of rows(sent)) {
    const k = String(r.userId);
    sentBy.set(k, [...(sentBy.get(k) ?? []), { kind: str(r.kind) ?? "", at: date(r.createdAt) ?? now, inviteId: str(r.inviteId) }]);
  }
  const rewardsBy = new Map<string, StudioDropCandidate["rewards"]>();
  for (const r of rows(invites)) {
    const k = String(r.senderUserId);
    const at = date(r.rewardedAt);
    if (at) rewardsBy.set(k, [...(rewardsBy.get(k) ?? []), { inviteId: String(r.id), rewardedAt: at }]);
  }
  return users.map((u): StudioDropCandidate => {
    const id = String(u.id);
    const wid = str(u.workspaceId);
    const paidWorkspace = Boolean(wid) && str(u.adsPlan) !== "trial" && PAID_WS.includes(str(u.wsStatus) ?? "") && !u.suspendedAt;
    const legacy = LEGACY.includes(str(u.plan) ?? "") && ["active", "trialing", "past_due"].includes(str(u.subStatus) ?? "");
    const testimonialsUser = legacy || u.boughtTesti === true;
    const paid = paidWorkspace || paidUsers.has(id) || testimonialsUser;
    const tr = wid ? trialBy.get(wid) : undefined;
    const trialAt = tr ? date(tr.completedAt) : null;
    const paidAt = [paidAtBy.get(id), wid ? paidAtBy.get(wid) : undefined].reduce<Date | null>((m, d) => (d && (!m || d < m) ? d : m), null);
    return {
      userId: id,
      email: String(u.email),
      name: str(u.name),
      signedUpAt: date(u.createdAt) ?? now,
      contactable: Boolean(date(u.emailVerifiedAt)) || paid,
      paid,
      paidWorkspace,
      testimonialsUser,
      unsubscribed: false,
      suspended: Boolean(u.suspendedAt),
      workspaceId: wid,
      studioSessions: nSessions.get(id) ?? 0,
      freeVideosLeft: wid ? Number(u.studioFreeVideos ?? 1) : 1,
      firstFreeVideoAt: date(u.studioOfferReadyAt),
      lastEmailAt: lastAt.get(id) ?? null,
      sent: sentBy.get(id) ?? [],
      rewards: rewardsBy.get(id) ?? [],
      trial: tr && trialAt ? { runId: String(tr.id), completedAt: trialAt, readyAdCount: Number(tr.ready ?? 0), paidAt } : null,
    };
  });
}
