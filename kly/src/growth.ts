// Autopilot growth systems that run inside Kly (review_gifts, new_business): shared cadence, events and copy.
// Kill switch / heartbeat / UTM come from the shared registry (src/lib/growth/systems.ts).
import type { Prisma } from "@prisma/client";
import { getSystem, systemEnabled, type SystemKey } from "../../src/lib/growth/systems";
import type { Db } from "./db";

export type KlySystem = Extract<SystemKey, "review_gifts" | "new_business">;
export const KLY_SYSTEMS: readonly KlySystem[] = ["review_gifts", "new_business"];

/** AdsEvent names Kly's growth systems write (props.system = key). Sign-ups come from first-touch utm_source. */
export const SYSTEM_EVENTS = { lead: "system_lead_found", gift: "system_gift_made", sent: "system_email_sent", viewed: "system_gift_viewed" } as const;

export async function systemEvent(db: Db, name: string, system: KlySystem, props: Record<string, unknown> = {}): Promise<void> {
  await db.adsEvent.create({ data: { name, props: { ...props, system } as Prisma.InputJsonValue } }).catch(() => undefined);
}

/** Pure: is a cycle of this system due (cadence from the registry)? */
export function cycleDue(key: KlySystem, lastAt: number | undefined, nowMs: number): boolean {
  return !lastAt || nowMs - lastAt >= (getSystem(key)?.cycleMinutes ?? 60) * 60_000;
}

export function isKlySystem(v: string | null | undefined): v is KlySystem {
  return v === "review_gifts" || v === "new_business";
}

/** Kill switch for one lead's system (classic leads have none = always allowed). */
export async function leadSystemAllowed(db: Db, system: string | null | undefined): Promise<boolean> {
  if (!system) return true;
  return isKlySystem(system) ? systemEnabled(db, system) : false;
}

/** Fixed copy for system leads (validated by the same compliance gate; never falls back to the classic "made you an ad"). */
export function systemVariant(lead: { system: string | null; systemData: unknown }): { subject: string; body: string; followup: string } | null {
  if (lead.system === "review_gifts") {
    const raw = String((lead.systemData as { reviewerName?: unknown } | null)?.reviewerName ?? "").replace(/[^\p{L} .'-]/gu, "").trim().slice(0, 40);
    const who = raw ? `${raw}'s review` : "One of your reviews";
    return {
      subject: "a video from your reviews",
      body: [`${who} on {business}'s website was too good to leave as text, so I turned it into a short video for you \u2193`, "", "{link}", "", "Their real words, credited to them, yours to post or ignore. Want more? Make them from your other reviews on that page."].join("\n"),
      followup: ["Your review video is still here if you want it: {link}", "", "No pressure either way."].join("\n"),
    };
  }
  if (lead.system === "new_business") {
    return {
      subject: "ads for your new site",
      body: ["Saw {business}'s new website just went live. Ozzy draws free Facebook ads straight from a site, and he's ready to make yours.", "", "{link}", "", "Tap it and he draws 3 ads live in about two minutes. Free to keep, no card, no catch."].join("\n"),
      followup: ["Ozzy's still ready to draw ads from your new site: {link}", "", "Takes two minutes, free either way."].join("\n"),
    };
  }
  return null;
}
