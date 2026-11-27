// Segment-aware nurture for free-pack users who have not paid (system `nurture`). Pure: segmenting, schedule, copy.
// Max 5 emails over 21 days from the day the free pack finished; stops on purchase / unsubscribe / reply. Each email
// gives value first and asks ONE question (replies go to the inbound auto-responder). Fixed copy, no AI.
import { AUTOPILOT_LAUNCH, isLaunchOfferOpen } from "../ads/billing-config";
import { AD_SPEND_LINE, AUTOPILOT_FIRST_MONTH_LINE, AUTOPILOT_GUARANTEE_LINE, DIY_PRICE_LINE, HERO_INCLUDES, HERO_PRICE_LINE, NO_GUARANTEE_LINE, PUBLIC_OFFER } from "../ads/public-offer";
import { PLAYBOOKS, type Playbook } from "../growth/trade-playbooks-data";
import { withSystemUtm } from "../growth/systems";
import { capBlocks, compose, DAY, suppressedBy, type Note, type SendRecord, type Suppression } from "./core";

export const NURTURE_SYSTEM = "nurture" as const;
export const NURTURE_MAX_EMAILS = 5;
export const NURTURE_WINDOW_DAYS = 21;
export const NURTURE_KINDS = ["n1_value", "n2_bridge", "n3_objection", "n4_objection", "n5_close"] as const;
export type NurtureKind = (typeof NURTURE_KINDS)[number];
/** Day offsets from pack finished; `lateDays` = how long after the day a send is still fresh enough. */
export const NURTURE_SCHEDULE: Record<NurtureKind, { day: number; lateDays: number }> = {
  n1_value: { day: 1, lateDays: 3 },
  n2_bridge: { day: 3, lateDays: 4 },
  n3_objection: { day: 8, lateDays: 4 },
  n4_objection: { day: 13, lateDays: 4 },
  n5_close: { day: 19, lateDays: 2 },
};
export const OBJECTIONS = ["price", "self_post", "will_it_work", "meta_setup"] as const;
export type Objection = (typeof OBJECTIONS)[number];

export interface NurtureInput {
  userId: string;
  firstName: string | null;
  trade: string | null; // kmd_trade / trade_picked slug
  isBusiness: boolean;
  source: string | null; // first-touch utm source
  packFinishedAt: Date | null;
  packFailed: boolean;
  downloaded: boolean;
  returned: boolean; // came back (any session/event) after the pack day
  adInsight: string | null; // a real insight from their own ad check, if one exists
  brandName: string | null;
  suppression: Suppression;
  /** All email sends to this user (any system) for the global caps. */
  sends: SendRecord[];
  /** This system's earlier sends: kind (+ objection used in props). */
  nurtureSent: Array<{ kind: NurtureKind; at: Date; objection?: Objection }>;
  autopilotUsed: boolean;
  appUrl: string;
  unsubscribeUrl: string;
}

export interface NurtureSegment { trade: string | null; business: boolean; activation: "downloaded" | "not_downloaded"; engaged: boolean; ticket: Playbook["ticket"] | null; sourceGroup: "paid_social" | "email" | "organic" | "other" }
export function nurtureSegment(i: Pick<NurtureInput, "trade" | "isBusiness" | "source" | "downloaded" | "returned">): NurtureSegment {
  const pb = playbookFor(i.trade);
  const s = (i.source ?? "").toLowerCase();
  const sourceGroup = /facebook|fb|instagram|meta|paid/.test(s) ? "paid_social" : /email|kly|gift|nolan/.test(s) ? "email" : /google|seo|organic|blog|bing|direct/.test(s) || !s ? "organic" : "other";
  return { trade: pb?.slug ?? null, business: i.isBusiness, activation: i.downloaded ? "downloaded" : "not_downloaded", engaged: i.downloaded || i.returned, ticket: pb?.ticket ?? null, sourceGroup };
}
export function playbookFor(trade: string | null): Playbook | null {
  return (trade && PLAYBOOKS.find((p) => p.slug === trade)) || null;
}

/** Order objection emails by what this segment is most likely to say. n3 = first, n4 = second, n5 = third. */
export function objectionOrder(seg: NurtureSegment): Objection[] {
  const first: Objection[] = [];
  if (seg.ticket === "high") first.push("will_it_work");
  if (!seg.business || seg.ticket === "low") first.push("price");
  if (seg.engaged) first.push("self_post");
  if (seg.business && !seg.engaged) first.push("meta_setup");
  const base: Objection[] = ["price", "self_post", "will_it_work", "meta_setup"];
  return [...new Set([...first, ...base])];
}

export function autopilotEligible(i: Pick<NurtureInput, "packFinishedAt" | "autopilotUsed">, now: Date): boolean {
  return !i.autopilotUsed && isLaunchOfferOpen(i.packFinishedAt, now, AUTOPILOT_LAUNCH);
}

/** The email due right now, or null. Pure; the loop adds claim + kill switch. */
export function nurtureDue(i: NurtureInput, now: Date): { kind: NurtureKind; objection?: Objection } | null {
  if (!i.packFinishedAt || i.packFailed) return null;
  if (suppressedBy(i.suppression)) return null;
  if (i.nurtureSent.length >= NURTURE_MAX_EMAILS) return null;
  const age = now.getTime() - i.packFinishedAt.getTime();
  if (age < 0 || age > NURTURE_WINDOW_DAYS * DAY) return null;
  const done = new Set(i.nurtureSent.map((s) => s.kind));
  const lastAt = Math.max(0, ...i.nurtureSent.map((s) => s.at.getTime()));
  if (lastAt && now.getTime() - lastAt < 2 * DAY) return null;
  if (capBlocks(i.sends, now)) return null;
  const kind = NURTURE_KINDS.find((k) => !done.has(k) && age >= NURTURE_SCHEDULE[k].day * DAY && age < (NURTURE_SCHEDULE[k].day + NURTURE_SCHEDULE[k].lateDays) * DAY);
  if (!kind) return null;
  if (kind === "n3_objection" || kind === "n4_objection" || kind === "n5_close") {
    const order = objectionOrder(nurtureSegment(i));
    const used = new Set(i.nurtureSent.map((s) => s.objection).filter(Boolean));
    const objection = order.find((o) => !used.has(o));
    return objection ? { kind, objection } : { kind };
  }
  return { kind };
}

export const BRIDGE_SUBJECTS = { a: "your ads are ready, want us to run them?", b: "what happens after you download your ads" } as const;
export type BridgeVariant = keyof typeof BRIDGE_SUBJECTS;

const link = (i: NurtureInput, kind: string, path = "/ads/app") => withSystemUtm(`${i.appUrl}${path}`, NURTURE_SYSTEM, { campaign: kind, medium: "email", content: "cta" });

function valueNote(i: NurtureInput): Note {
  const pb = playbookFor(i.trade);
  const biz = i.brandName?.trim() || "your business";
  const paragraphs: string[] = [];
  if (pb) {
    paragraphs.push(`I put together what a ${pb.term} ad needs, because the free ads in your pack follow the same shape:`);
    paragraphs.push([`- Open on the moment the customer is in. For example: "${pb.hooks[0]}"`, `- One clear offer. Common ones in the trade: ${pb.offers.slice(0, 2).join("; ")}.`, `- Something that builds trust: ${pb.proof.slice(0, 2).join("; ")}.`].join("\n"));
    paragraphs.push(`Format-wise: ${pb.formats}`);
  } else {
    paragraphs.push(`A good local ad needs three things: an opening line about the moment the customer is in, one clear offer, and something that builds trust (reviews, years in business, a licence). The ads in your pack for ${biz} follow that shape.`);
  }
  if (i.adInsight) paragraphs.push(`From your own ad check: ${i.adInsight}`);
  paragraphs.push("No pitch in this one. I'm just trying to make the pack useful.");
  return { subject: pb ? `what a good ${pb.term} ad needs` : "what a good local ad needs", text: compose({ firstName: i.firstName, paragraphs, link: { label: "Your ads", url: link(i, "n1_value") }, question: "What's the one job or service you'd most like more enquiries for right now?", unsubscribeUrl: i.unsubscribeUrl }) };
}

function bridgeNote(i: NurtureInput, now: Date, variant: BridgeVariant): Note {
  const eligible = autopilotEligible(i, now);
  const paragraphs = [`Your ads are ready. Writing them is the easy part: the work that follows is launching them in Meta, watching which ones waste money, and swapping in new ones every week.`, `That's what our Growth Autopilot does for you: ${HERO_INCLUDES}.`];
  if (eligible) paragraphs.push(`Since your free pack just finished, the first month is ${AUTOPILOT_FIRST_MONTH_LINE}. That first-month price only applies for a limited window after the pack, and only once.`);
  else paragraphs.push(`It's ${HERO_PRICE_LINE}.`);
  paragraphs.push(`${AD_SPEND_LINE} ${NO_GUARANTEE_LINE}`);
  paragraphs.push("If you'd rather post the ads yourself, that's completely fine, the pack is yours.");
  return { subject: BRIDGE_SUBJECTS[variant], text: compose({ firstName: i.firstName, paragraphs, link: { label: "See how it works", url: link(i, "n2_bridge", "/ads/team") }, question: "Are you planning to run these yourself, or would you want someone to handle it?", unsubscribeUrl: i.unsubscribeUrl }) };
}

const OBJECTION_COPY: Record<Objection, (i: NurtureInput) => { subject: string; paragraphs: string[]; question: string }> = {
  price: () => ({
    subject: "what it costs, plainly",
    paragraphs: [`Here's the full price picture so there are no surprises. ${HERO_PRICE_LINE}. If you want to stay hands-on, there's ${DIY_PRICE_LINE}. Or you can unlock the rest of your free pack once for ${PUBLIC_OFFER.unlockPrice} and post it yourself.`, AD_SPEND_LINE],
    question: "What would this need to cost for it to be an easy yes, or is it not the right time at all?",
  }),
  self_post: () => ({
    subject: "posting the ads yourself is fine",
    paragraphs: ["You can post these ads yourself, and plenty of owners do. What changes is the weekly work: putting new ads up, checking which ones are wasting money, and replying to leads fast.", "If you have the time for that, keep going on your own. If you don't, that's the part we take off your plate."],
    question: "Honestly, how many hours a week could you give to your ads?",
  }),
  will_it_work: () => ({
    subject: "will it actually work?",
    paragraphs: ["Fair question. I can't promise leads or sales: that depends on your offer, your area and your market, and anyone who promises numbers is guessing.", `What I can commit to is our work. ${AUTOPILOT_GUARANTEE_LINE}`, "Your ads, spend and leads are visible in your own Meta account, so nothing is hidden."],
    question: "What would you need to see to feel it's worth a try?",
  }),
  meta_setup: () => ({
    subject: "what about the Meta setup?",
    paragraphs: ["Setup is the part most owners worry about. We set up your Meta connection with you, step by step, so you don't have to work it out alone.", "You'll need a Facebook account that can manage your business Page. If you don't have an ad account yet, we help you create one."],
    question: "Do you already have a Facebook business Page and an ad account?",
  }),
};

function objectionNote(i: NurtureInput, o: Objection): Note {
  const c = OBJECTION_COPY[o](i);
  return { subject: c.subject, text: compose({ firstName: i.firstName, paragraphs: c.paragraphs, link: { label: "Your ads and next steps", url: link(i, `obj_${o}`) }, question: c.question, unsubscribeUrl: i.unsubscribeUrl }) };
}

function closeNote(i: NurtureInput, o: Objection | undefined): Note {
  const extra = o ? OBJECTION_COPY[o](i).paragraphs[0] : null;
  const paragraphs = ["This is my last note in this series, so I won't keep filling your inbox.", ...(extra ? [extra] : []), "Your free ads stay in your account either way."];
  return { subject: "last one from me", text: compose({ firstName: i.firstName, paragraphs, link: { label: "Your ads", url: link(i, "n5_close") }, question: "What stopped you from going further with your ads, if anything?", unsubscribeUrl: i.unsubscribeUrl }) };
}

export function nurtureNote(i: NurtureInput, due: { kind: NurtureKind; objection?: Objection }, now: Date, bridgeVariant: BridgeVariant = "a"): Note {
  switch (due.kind) {
    case "n1_value": return valueNote(i);
    case "n2_bridge": return bridgeNote(i, now, bridgeVariant);
    case "n3_objection":
    case "n4_objection": return objectionNote(i, due.objection ?? "price");
    case "n5_close": return closeNote(i, due.objection);
  }
}
