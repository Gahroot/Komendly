// Owner notice emails for Ozzy's team (paused, capped, needs reconnect, blocked). Transactional service notices about
// the owner's own ad spend: no marketing content, so no unsubscribe (they stop when the owner ends the service).
import { esc } from "../../../src/lib/ads/lifecycle/template";
import type { MandateState } from "../../../src/lib/ads/team/contracts";
import { createSmtpSender, smtpConfigured, type OutMail, type SendMail } from "../lifecycle/mail";
import { log } from "../log";
import type { TeamNotify } from "./team-ops";

const SUBJECTS: Record<MandateState, string> = {
  capped: "Ozzy paused your ads: monthly budget limit reached",
  paused: "Ozzy paused your ads",
  stopped: "Ozzy stopped your ads",
  needs_reconnect: "Ozzy needs you to reconnect Meta",
  blocked: "Ozzy's team needs something from you before launch",
  pending: "Update from Ozzy's team",
  live: "Your ads are running again",
};

export function teamNoticeMail(n: Parameters<TeamNotify>[0]): OutMail {
  const subject = SUBJECTS[n.state] ?? SUBJECTS.pending;
  const lines = [
    n.reason,
    n.state === "capped" ? "Nothing more will be spent this month. The team turns your ads back on automatically on the 1st." : "",
    `See what happened and what to do next on your team page: ${n.teamUrl}`,
  ].filter(Boolean);
  const text = [...lines, "--", "Ozzy from Komendly"].join("\n\n");
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1530;"><div style="max-width:560px;margin:0 auto;">${lines
    .slice(0, -1)
    .map((l) => `<p style="font-size:16px;line-height:1.6;margin:0 0 14px;">${esc(l)}</p>`)
    .join("")}<p style="margin:20px 0;"><a href="${esc(n.teamUrl)}" style="display:inline-block;background:#ffcf3f;color:#1a1530;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px;">Open your team page</a></p><p style="font-size:14px;color:#6b6580;margin:24px 0 0;">Ozzy from Komendly</p></div></body></html>`;
  return { to: n.to, subject, text, html, headers: { "X-Komendly-Notice": `team-${n.state}` } };
}

export function teamNotifier(send: SendMail): TeamNotify {
  return (n) => send(teamNoticeMail(n));
}

let fallback: TeamNotify | null = null;
/** SMTP sender when configured, else a logger (local/dev). */
export function defaultTeamNotify(): TeamNotify {
  if (!fallback) {
    fallback = smtpConfigured()
      ? teamNotifier(createSmtpSender())
      : async (n) => log("info", "team notice (SMTP not configured, logged)", { to: n.to, state: n.state });
  }
  return fallback;
}
