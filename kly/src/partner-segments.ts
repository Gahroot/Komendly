// Partner-channel outreach (agencies, freelancers who make ads for clients). OFF by default: nothing here is seeded or
// selectable until AdsFeatureFlag "kly_partner_segments" is enabled (admin flag table; no schema change). Sending caps,
// the governor and the sender are untouched: these are ordinary segment + copy arms (audience "agency"), so they pass
// through the same checkVariant rules, footer (postal address from OUTBOUND_POSTAL_ADDRESS only) and unsubscribe.
// Copy is plain and honest: a real sample ad, no claims about other agencies, no results, no partner-commission pitch.
import type { Prisma } from "@prisma/client";
import { checkVariant, type CopyDimension, type GiftTiming } from "../../src/lib/ads/outbound/copy";
import type { Db } from "./db";
import { decide } from "./settings";
import { METROS, PARTNER_NICHES } from "./targets";

export const PARTNER_FLAG = "kly_partner_segments";

export interface PartnerCopy {
  dimension: CopyDimension;
  key: string;
  template: string;
  timing: GiftTiming | "any";
}

/**
 * Three first-touch body variants for the partner niches. They are niche-agnostic on purpose: the copy arm picker filters
 * by audience ("agency"), not by niche, so wording must be true for SEO, Shopify, branding, social and media-buying shops alike.
 */
export const PARTNER_COPY: PartnerCopy[] = [
  { dimension: "body", key: "partner-sample", timing: "any", template: ["Here's a Facebook ad for {business}, drawn from your website:", "", "{link}", "", "Komendly makes ads like this from any website. If a client of yours needs creative for Meta, point it at their site and review the pack like a first draft. Your first 10 ads are free, no card."].join("\n") },
  { dimension: "body", key: "partner-first-draft", timing: "any", template: ["A first draft of ads for {business}, made from your site:", "", "{link}", "", "It takes a couple of minutes, so it's handy before a client kickoff or a pitch. Check it on your own site first; the first 10 ads are free, no card."].join("\n") },
  { dimension: "body", key: "partner-many-brands", timing: "any", template: ["Would you hand this ad to a client? It's for {business}, from your website:", "", "{link}", "", "There's an Agency plan for working across several client brands. Try the free pack first and decide if it saves you time. No card needed."].join("\n") },
];

export function partnerSeedArms(): { dimension: "body" | "segment"; key: string; content: Record<string, unknown> }[] {
  return [
    ...PARTNER_COPY.map((c) => ({ dimension: c.dimension as "body", key: c.key, content: { template: c.template, audience: "agency", timing: c.timing } })),
    ...PARTNER_NICHES.map((n) => ({ dimension: "segment" as const, key: n.niche, content: { niche: n.niche, cities: METROS, audience: n.audience, tier: n.tier } })),
  ];
}

export const PARTNER_ARM_KEYS: ReadonlySet<string> = new Set(partnerSeedArms().map((a) => `${a.dimension}:${a.key}`));

/** Validation used by tests: every partner variant must pass the same rules as any seeded copy. */
export function partnerCopyErrors(): string[] {
  return PARTNER_COPY.flatMap((c) => {
    const e = checkVariant(c.dimension, c.template);
    return e ? [`${c.key}: ${e}`] : [];
  });
}

export async function partnerSegmentsEnabled(db: Db): Promise<boolean> {
  return (await db.adsFeatureFlag.findUnique({ where: { key: PARTNER_FLAG } }))?.enabled === true;
}

/**
 * Keeps the partner arms in line with the flag: off = retire them (stats stay), on = revive retired ones. Returns the flag
 * state; the caller seeds missing arms only when it is on.
 */
export async function syncPartnerArms(db: Db, existing: { id: string; dimension: string; key: string; status: string }[]): Promise<boolean> {
  const on = await partnerSegmentsEnabled(db);
  const mine = existing.filter((a) => PARTNER_ARM_KEYS.has(`${a.dimension}:${a.key}`));
  const toChange = mine.filter((a) => (on ? a.status === "retired" : a.status !== "retired")).map((a) => a.id);
  if (toChange.length) {
    await db.klyArm.updateMany({ where: { id: { in: toChange } }, data: on ? { status: "active", retiredAt: null } : { status: "retired", retiredAt: new Date() } as Prisma.KlyArmUpdateManyMutationInput });
    await decide(db, on ? "arm_new" : "arm_retire", `${on ? "Reactivated" : "Retired"} ${toChange.length} partner-channel arms (flag ${PARTNER_FLAG} ${on ? "on" : "off"}).`, { ids: toChange });
    for (const a of mine) if (toChange.includes(a.id)) a.status = on ? "active" : "retired";
  }
  return on;
}
