// Activation rescue (system `activation_rescue`): detect where a free-pack or paying user is stuck, send the specific
// unblocker (exact next step + link), and record the cause (AdsEvent `activation_stuck`) so patterns surface.
// Pure. Causes that are OUR bug also raise a deduped alert to Nolan. Never refunds or credits automatically.
import { withSystemUtm } from "../growth/systems";
import { capBlocks, compose, DAY, H, suppressedBy, type Note, type SendRecord, type Suppression } from "./core";

export const RESCUE_SYSTEM = "activation_rescue" as const;
export const STUCK_CAUSES = ["no_url", "pack_failed", "pack_empty", "never_downloaded", "tried_locked", "buyer_never_downloaded", "paid_download_refused", "autopilot_pre_meta"] as const;
export type StuckCause = (typeof STUCK_CAUSES)[number];

export interface RescueState {
  now: Date;
  signedUpAt: Date;
  hasRun: boolean;
  /** Latest non-gift run of the workspace. */
  run: { id: string; status: string; completedAt: Date | null; createdAt: Date; ready: number; error: string | null } | null;
  downloadedAt: Date | null; // latest export_downloaded
  lockedRefusedAt: Date | null; // latest locked_asset_refused
  unlockPaidAt: Date | null; // $9 unlock_pack purchase
  subscribed: boolean;
  autopilot: { paidAt: Date | null; metaConnected: boolean } | null;
}

export interface Stuck { cause: StuckCause; ourBug: boolean; email: boolean; since: Date }

export function detectStuck(s: RescueState): Stuck[] {
  const t = s.now.getTime();
  const out: Stuck[] = [];
  const r = s.run;
  const age = (d: Date) => t - d.getTime();
  if (!s.hasRun && age(s.signedUpAt) >= DAY && age(s.signedUpAt) < 14 * DAY) out.push({ cause: "no_url", ourBug: false, email: false, since: s.signedUpAt }); // lifecycle start_nudge_* already emails this
  if (r) {
    const done = r.completedAt ?? r.createdAt;
    if (r.status === "failed" && age(done) >= H && age(done) < 14 * DAY) out.push({ cause: "pack_failed", ourBug: true, email: true, since: done });
    if ((r.status === "completed" || r.status === "partial") && r.completedAt && age(r.completedAt) >= H && age(r.completedAt) < 14 * DAY && (r.ready === 0 || (r.status === "partial" && r.ready < 3))) out.push({ cause: "pack_empty", ourBug: true, email: true, since: r.completedAt });
    const readyPack = (r.status === "completed" || r.status === "partial") && r.ready > 0 && r.completedAt;
    if (readyPack && r.completedAt && !s.downloadedAt && !s.subscribed && !s.unlockPaidAt && age(r.completedAt) >= DAY && age(r.completedAt) < 10 * DAY) out.push({ cause: "never_downloaded", ourBug: false, email: true, since: r.completedAt });
  }
  const paid = s.subscribed || s.unlockPaidAt !== null;
  if (s.lockedRefusedAt && !paid && age(s.lockedRefusedAt) >= H && age(s.lockedRefusedAt) < 7 * DAY) out.push({ cause: "tried_locked", ourBug: false, email: true, since: s.lockedRefusedAt });
  if (s.unlockPaidAt && (!s.downloadedAt || s.downloadedAt < s.unlockPaidAt) && age(s.unlockPaidAt) >= 12 * H && age(s.unlockPaidAt) < 10 * DAY) out.push({ cause: "buyer_never_downloaded", ourBug: false, email: true, since: s.unlockPaidAt });
  const paidAt = s.unlockPaidAt;
  if (paid && s.lockedRefusedAt && (!paidAt || s.lockedRefusedAt > paidAt) && age(s.lockedRefusedAt) >= H && age(s.lockedRefusedAt) < 7 * DAY) out.push({ cause: "paid_download_refused", ourBug: true, email: true, since: s.lockedRefusedAt });
  if (s.autopilot && s.autopilot.paidAt && !s.autopilot.metaConnected && age(s.autopilot.paidAt) >= DAY && age(s.autopilot.paidAt) < 21 * DAY) out.push({ cause: "autopilot_pre_meta", ourBug: false, email: false, since: s.autopilot.paidAt }); // proof.ts meta_24h/meta_72h already emails this
  return out;
}

/** Pick the one stuck cause to email about now: our-bug causes first, then by order of STUCK_CAUSES. */
export function pickRescueEmail(stuck: readonly Stuck[], alreadySent: ReadonlySet<StuckCause>): Stuck | null {
  return [...stuck].filter((x) => x.email && !alreadySent.has(x.cause)).sort((a, b) => Number(b.ourBug) - Number(a.ourBug) || STUCK_CAUSES.indexOf(a.cause) - STUCK_CAUSES.indexOf(b.cause))[0] ?? null;
}

/** Caps: our-bug apologies are service messages (only deduped); the rest respect the global caps. */
export function rescueMayEmail(x: Stuck, o: { suppression: Suppression; sends: readonly SendRecord[]; now: Date }): boolean {
  if (suppressedBy(o.suppression, { ignorePaid: true, ignoreReplied: x.ourBug })) return false;
  return x.ourBug || !capBlocks(o.sends, o.now);
}

export interface RescueCtx { firstName: string | null; runUrl: string; pricingUrl: string; unsubscribeUrl: string }
export function rescueNote(cause: StuckCause, c: RescueCtx): Note {
  const u = (content: string, url: string) => withSystemUtm(url, RESCUE_SYSTEM, { campaign: cause, medium: "email", content });
  const base = { firstName: c.firstName, unsubscribeUrl: c.unsubscribeUrl };
  const link = (label: string) => ({ label, url: u("cta", c.runUrl) });
  switch (cause) {
    case "pack_failed":
      return { subject: "your ads didn't finish, that's on us", text: compose({ ...base, paragraphs: ["Your free ads didn't finish building. That's a problem on our side, not something you did wrong, and I've been told about it.", "Starting the run again from your account usually works. If it fails again, just reply and I'll sort it out personally."], link: link("Start it again"), question: "Is the website address you used the one you want ads for?" }) };
    case "pack_empty":
      return { subject: "your ad pack came out thin, sorry", text: compose({ ...base, paragraphs: ["Your free pack finished with few or no usable ads. That's on us, and I've been alerted so we can look at your site.", "You can try again from your account, or reply with the website address and I'll check what went wrong."], link: link("Open your pack"), question: "Which website address did you want ads for?" }) };
    case "never_downloaded":
      return { subject: "your ads are waiting, here's how to grab them", text: compose({ ...base, paragraphs: ["Your free ads are ready but I can't see that you've downloaded any yet.", "Open your pack, then use the download button to get them, or open any ad and save it on its own. They work on Facebook, Instagram and your website."], link: link("Open your pack"), question: "Did something get in the way of downloading, or are they just not what you wanted?" }) };
    case "tried_locked":
      return { subject: "about the ads that are locked", text: compose({ ...base, paragraphs: ["It looks like you tried to open an ad that's still locked. Part of the pack is free; the rest unlocks with any plan or a one-time $9 unlock.", "The free ads are yours to download right now, no card needed."], link: link("Open your pack"), question: "Was it a particular ad you were after, or would you rather see the full pack first?" }) };
    case "buyer_never_downloaded":
      return { subject: "your full pack is unlocked, here's where to find it", text: compose({ ...base, paragraphs: ["Thanks for unlocking your pack. I can't see a download yet, so in case it's hard to find: open your pack and use the download button.", "If a button doesn't work or an ad looks wrong, reply and I'll fix it."], link: link("Open your pack"), question: "Did the download work for you?" }) };
    case "paid_download_refused":
      return { subject: "you paid and the download was refused, I'm on it", text: compose({ ...base, paragraphs: ["The system refused one of your downloads even though your pack is unlocked. That's our bug, and I've been alerted.", "Try again in a few minutes. If it still fails, reply and I'll send the files by hand."], link: link("Open your pack"), question: "Which ad were you trying to download when it failed?" }) };
    default:
      return { subject: "a quick question", text: compose({ ...base, paragraphs: ["I wanted to check you're not stuck."], question: "Is anything in the way?" }) };
  }
}

export const OUR_BUG_ALERT_EMAIL = "nolan@prestyj.com";
export function bugAlertNote(o: { cause: StuckCause; workspaceId: string; userEmail: string; runId: string | null; detail: string | null; adminUrl: string }): Note {
  return { subject: `[Komendly] activation bug: ${o.cause}`, text: [`Cause: ${o.cause} (our side)`, `Customer: ${o.userEmail}`, `Workspace: ${o.workspaceId}`, o.runId ? `Run: ${o.runId}` : "", o.detail ? `Detail: ${o.detail}` : "", `Admin: ${o.adminUrl}`, "", "The customer got an apology with the next step. Nothing was credited or refunded automatically; decide in admin."].filter(Boolean).join("\n") };
}
