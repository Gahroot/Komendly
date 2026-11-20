// Weekly scoreboard review (autopilot plan s7), unattended: every Monday the founder gets the scoreboard by email with
// the plan's course-change rules already applied. Pure: the cron route loads the data and sends.
import { SCORE_CHANNEL_LABEL, SCORE_CHANNELS, type CheckpointRow, type Scoreboard, type ScoreWeek } from "./scoreboard";

export const SCOREBOARD_DIGEST_EVENT = "scoreboard_digest_sent";

export type DigestFacts = {
  board: Scoreboard;
  checkpoints: CheckpointRow[];
  /** Cold emails sent all-time (Kly), for the "500 actions, no sign-ups" rule. */
  klySendsTotal: number;
  now: Date;
};

const DEC15 = Date.UTC(2026, 11, 15);

/** The plan's "when to change course" rules, as plain-English flags (empty = nothing to change). */
export function digestFlags(f: DigestFacts): string[] {
  const flags: string[] = [];
  const weeks = f.board.weeks;
  const last = weeks.at(-1);
  const prev = weeks.at(-2);
  const recent = weeks.slice(-3);
  const recentSignups = recent.reduce((n, w) => n + w.signupTotal, 0);
  const recentPayments = recent.reduce((n, w) => n + w.paymentTotal, 0);
  const totalPayments = SCORE_CHANNELS.reduce((n, c) => n + f.board.totals.payments[c], 0);
  if (last && prev && last.signupTotal > prev.signupTotal && recentPayments === 0 && recentSignups >= 20) {
    flags.push("Sign-ups are rising and payments are still zero: stop adding channels and fix the offer.");
  } else if (totalPayments === 0 && recentSignups >= 50) {
    flags.push(`${recentSignups} sign-ups in 3 weeks and no payment yet: look at the offer before adding volume.`);
  }
  if (f.klySendsTotal >= 500 && f.board.totals.signups.kly === 0) {
    flags.push(`Kly cold email: ${f.klySendsTotal} emails sent and no sign-ups. Plan rule: switch it off (or rewrite).`);
  }
  if (f.now.getTime() >= DEC15) {
    const missed = f.checkpoints.filter((r) => r.met && !r.met.dec15).map((r) => r.label);
    if (missed.length >= Math.ceil(f.checkpoints.length / 2)) {
      flags.push(`15 December targets missed (${missed.join("; ")}): report and propose a new date rather than push more volume.`);
    }
  }
  return flags;
}

function weekLine(w: ScoreWeek): string {
  const by = SCORE_CHANNELS.filter((c) => w.signups[c] || w.payments[c]).map((c) => `${SCORE_CHANNEL_LABEL[c]} ${w.signups[c]}/${w.payments[c]}`);
  return `Week of ${w.week}: ${w.signupTotal} sign-ups, ${w.paymentTotal} payments${by.length ? ` (${by.join(", ")})` : ""}`;
}

/** Subject + plain-text body. */
export function digestMessage(f: DigestFacts, adminUrl: string): { subject: string; text: string } {
  const flags = digestFlags(f);
  const paying = f.checkpoints.find((r) => r.key === "paying")?.live ?? "0";
  const lines = [
    `Komendly weekly scoreboard: ${paying} of 10 paying customers.`,
    "",
    flags.length ? "CHANGE COURSE" : "No course-change rule triggered this week.",
    ...flags.map((x) => `- ${x}`),
    "",
    "LAST 4 WEEKS (sign-ups/payments by channel)",
    ...f.board.weeks.slice(-4).map(weekLine),
    "",
    "CHECKPOINTS (live / 15 Dec / 31 Jan)",
    ...f.checkpoints.map((r) => `- ${r.label}: ${r.live} / ${r.dec15} / ${r.jan31}`),
    "",
    `Full scoreboard: ${adminUrl}`,
  ];
  return { subject: `Scoreboard: ${paying}/10 paying${flags.length ? `, ${flags.length} to act on` : ""}`, text: lines.join("\n") };
}
