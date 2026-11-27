// Build in public (opportunity #99, system `build_in_public`): turns a DB snapshot of REAL numbers into post DRAFTS.
// Pure: no I/O. Rules: numbers only from the snapshot, "0" is stated as 0, never rounded up, no revenue claims beyond
// payingCustomers, and every draft says it is written by Ozzy (AI) for Komendly. Drafts are files for a human/desktop
// agent to post; nothing here posts anywhere.
import { SITE_URL } from "../site";
import { withSystemUtm } from "./systems";

export interface BipSnapshot {
  /** ISO date the snapshot was taken (YYYY-MM-DD). */
  date: string;
  /** Real (non-internal) sign-ups all time / last 7 days. */
  signupsTotal: number;
  signups7d: number;
  payingCustomers: number;
  /** Cold emails sent all time (non-dry-run sequence sends). */
  coldEmailsSent: number;
  /** Social posts that went out (KlySocialPost status posted). */
  socialPostsPosted: number;
  /** Systems switched on / registered. */
  systemsOn: number;
  systemsTotal: number;
  /** Top first-touch sources by sign-ups. */
  topSources: Array<{ source: string; signups: number }>;
}

export interface BipDelta { signups: number; payingCustomers: number; coldEmailsSent: number; socialPostsPosted: number }
export function deltaSince(now: BipSnapshot, prev: BipSnapshot | null): BipDelta | null {
  if (!prev) return null;
  return { signups: now.signupsTotal - prev.signupsTotal, payingCustomers: now.payingCustomers - prev.payingCustomers, coldEmailsSent: now.coldEmailsSent - prev.coldEmailsSent, socialPostsPosted: now.socialPostsPosted - prev.socialPostsPosted };
}

export interface BipDraft { platform: "x" | "linkedin" | "long"; text: string; link: string }
export const AI_NOTE = "Written by Ozzy, Komendly's AI.";
const n = (x: number) => x.toLocaleString("en-US");
const plural = (x: number, w: string) => `${n(x)} ${w}${x === 1 ? "" : "s"}`;

export function buildDrafts(s: BipSnapshot, prev: BipSnapshot | null = null): BipDraft[] {
  const link = (p: string) => withSystemUtm(`${SITE_URL}${p}`, "build_in_public", { medium: "social", campaign: s.date });
  const d = deltaSince(s, prev);
  const payLine = s.payingCustomers === 0 ? "Paying customers: 0. Still working on the first." : `Paying customers: ${n(s.payingCustomers)}.`;
  const weekLine = d ? `Since the last update: ${plural(d.signups, "sign-up")}, ${plural(d.coldEmailsSent, "cold email")}, ${plural(d.socialPostsPosted, "post")}.` : `Last 7 days: ${plural(s.signups7d, "sign-up")}.`;
  const top = s.topSources.filter((t) => t.signups > 0).slice(0, 3).map((t) => `${t.source} ${t.signups}`).join(", ");
  const x = `Komendly build log ${s.date}: ${plural(s.signupsTotal, "real sign-up")} so far, ${s.payingCustomers === 0 ? "0 paying customers yet" : `${plural(s.payingCustomers, "paying customer")}`}. ${n(s.coldEmailsSent)} cold emails sent. ${AI_NOTE}`;
  const long = [
    `Komendly build log, ${s.date}`,
    `Real numbers, test accounts excluded.`,
    `Sign-ups: ${n(s.signupsTotal)} all time, ${n(s.signups7d)} in the last 7 days.${top ? ` Top sources: ${top}.` : ""}`,
    payLine,
    `Cold emails sent: ${n(s.coldEmailsSent)}. Social posts published: ${n(s.socialPostsPosted)}. Growth systems on: ${n(s.systemsOn)} of ${n(s.systemsTotal)}.`,
    weekLine,
    `We are a small team building an AI that makes Facebook and Instagram ads from a website. Free ads: ${link("/free-ads")}`,
    AI_NOTE,
  ].join("\n\n");
  return [
    { platform: "x", text: x, link: link("/free-ads") },
    { platform: "linkedin", text: long, link: link("/free-ads") },
    { platform: "long", text: long, link: link("/free-ads") },
  ];
}

/** Why a draft must not be posted (null = ok). */
export function checkDraft(d: BipDraft, s: BipSnapshot): string | null {
  if (d.platform === "x" && (d.text + " " + d.link).length > 280 + 23) return "x draft over 280 chars (+ link)";
  if (!d.text.includes("Ozzy")) return "missing AI disclosure";
  if (!d.link.includes("utm_source=build_in_public")) return "link without utm";
  if (s.payingCustomers === 0 && /\b(\$|revenue|MRR|ARR|paying customers?: [1-9])/i.test(d.text)) return "money claim with no paying customers";
  return null;
}
