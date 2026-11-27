"use client";

import { CheckCircle2, CircleHelp, ExternalLink, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GoogleConnection } from "@/lib/ads/google/client-api";
import { AcceptSteps, CreatedSteps, type SetupNote } from "./connect";
import { GOOGLE_ADS_HOME, GOOGLE_BILLING_URL, GOOGLE_MANAGERS_URL, blockerText, formatCustomerId } from "./logic";

type Row = { key: string; state: "ok" | "bad" | "wait" | "unknown"; label: string; fix?: { label: string; href?: string; onClick?: () => void } };

export function readinessRows(c: GoogleConnection, note: SetupNote | null, onResendLink: () => void): Row[] {
  const r = c.readiness;
  const rows: Row[] = [];
  if (c.mode === "manager") {
    const acceptUrl = note?.kind === "linked" ? note.acceptUrl : GOOGLE_MANAGERS_URL;
    rows.push(
      r.managerLink === "active" ? { key: "link", state: "ok", label: "Komendly has access to your account." }
        : r.managerLink === "pending" ? { key: "link", state: "wait", label: "Waiting for you to accept Komendly's access request in Google Ads.", fix: { label: "Open Managers in Google Ads", href: acceptUrl } }
        : r.managerLink === "rejected" ? { key: "link", state: "bad", label: "The access request was declined.", fix: { label: "Send it again", onClick: onResendLink } }
        : { key: "link", state: "bad", label: "Komendly doesn't have access to this account yet.", fix: { label: "Send access request", onClick: onResendLink } },
    );
  }
  const billingUrl = note?.kind === "created" ? note.billingUrl || GOOGLE_BILLING_URL : GOOGLE_BILLING_URL;
  rows.push(
    r.billing === "ok" ? { key: "billing", state: "ok", label: "A payment card is set up in Google Ads." }
      : r.billing === "missing" ? { key: "billing", state: "bad", label: "No payment card in Google Ads yet. Google needs one before ads can run.", fix: { label: "Add my card in Google Ads", href: billingUrl } }
      : { key: "billing", state: "unknown", label: "We can't see your payment details yet. We'll keep checking.", fix: { label: "Check billing in Google Ads", href: billingUrl } },
  );
  rows.push(
    r.account === "ok" ? { key: "account", state: "ok", label: "Your Google Ads account is in good standing." }
      : r.account === "suspended" ? { key: "account", state: "bad", label: "Google has paused this account. Open Google Ads to see why and fix it.", fix: { label: "Open Google Ads", href: GOOGLE_ADS_HOME } }
      : r.account === "canceled" ? { key: "account", state: "bad", label: "This Google Ads account is closed. Reopen it in Google Ads or use another one.", fix: { label: "Open Google Ads", href: GOOGLE_ADS_HOME } }
      : { key: "account", state: "unknown", label: "Checking your account with Google." },
  );
  return rows;
}

const ICON = {
  ok: <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-label="Done" />,
  bad: <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Needs fixing" />,
  wait: <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" aria-label="Waiting" />,
  unknown: <CircleHelp className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not known yet" />,
};

export function ReadinessStep({
  connection, note, onRecheck, checking, onResendLink, resending,
}: {
  connection: GoogleConnection;
  note: SetupNote | null;
  onRecheck: () => void;
  checking: boolean;
  onResendLink: () => void;
  resending: boolean;
}) {
  const r = connection.readiness;
  const rows = readinessRows(connection, note, onResendLink);
  const showNote = note && !r.canPublish && (note.kind === "created" ? r.billing !== "ok" : r.managerLink === "pending");
  // Server blockers not already covered by a row above.
  const covered = /card|billing|payment|access|manager|suspend|closed|cancel/i;
  const extra = r.blockers.map(blockerText).filter((b) => !covered.test(b));
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        Account: <span className="font-medium text-foreground">{connection.accountName || "Your Google Ads account"}</span>
        {connection.customerId && <> · {formatCustomerId(connection.customerId)}</>}{connection.currency && <> · {connection.currency}</>}
      </p>
      {showNote && <div className="rounded-md bg-muted/50 px-3 py-3">{note.kind === "created" ? <CreatedSteps note={note} /> : <AcceptSteps note={note} />}</div>}
      <ul className="space-y-2" aria-live="polite">
        {rows.map((row) => (
          <li key={row.key} className="flex gap-2 rounded-md border border-border bg-card/50 px-3 py-2">
            {ICON[row.state]}
            <span className="min-w-0 space-y-1">
              <span className="block">{row.label}</span>
              {row.state !== "ok" && row.fix && (row.fix.href ? (
                <a className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" href={row.fix.href} target="_blank" rel="noreferrer">
                  {row.fix.label} <ExternalLink className="size-3.5" />
                </a>
              ) : (
                <Button size="sm" variant="outline" onClick={row.fix.onClick} disabled={resending}>{resending && <Loader2 className="animate-spin" />} {row.fix.label}</Button>
              ))}
            </span>
          </li>
        ))}
        {extra.map((b) => (
          <li key={b} className="flex gap-2 rounded-md border border-border bg-card/50 px-3 py-2">{ICON.bad}<span>{b}</span></li>
        ))}
      </ul>
      {r.canPublish ? (
        <p className="flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" /> All set. Your account is ready.</p>
      ) : (
        <p className="text-muted-foreground">
          {rows.some((x) => x.state === "bad") || extra.length ? "Fix the red items above. " : "Waiting on Google. "}This page checks again by itself every 10 seconds.
        </p>
      )}
      <Button variant="outline" size="sm" onClick={onRecheck} disabled={checking}>{checking ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check again</Button>
    </div>
  );
}
