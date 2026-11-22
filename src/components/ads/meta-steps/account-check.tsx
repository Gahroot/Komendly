"use client";

import { CheckCircle2, ExternalLink, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NO_AD_ACCOUNT_HELP, type Readiness } from "@/lib/ads/meta/readiness";
import { LAUNCH_GUIDE_TITLE } from "@/lib/ads/launch-guide";
import { MetaAccountPicker } from "../meta-account-picker";
import type { MetaOkStatus } from "./types";

/** Readiness of the current pick: the chosen account's, else the connection-wide one (no account / no Page). */
export function currentReadiness(status: MetaOkStatus, adAccountId: string): Readiness | null {
  const acc = status.accounts;
  if (!acc || "error" in acc) return null;
  return acc.adAccounts.find((a) => a.id === adAccountId)?.readiness ?? acc.readiness;
}

export function AccountCheckStep({
  status, adAccountId, pageId, onAdAccount, onPage, onRecheck, checking, onDisconnect,
}: {
  status: MetaOkStatus;
  adAccountId: string;
  pageId: string;
  onAdAccount: (id: string) => void;
  onPage: (id: string) => void;
  onRecheck: () => void;
  checking: boolean;
  onDisconnect: () => void;
}) {
  const acc = status.accounts;
  if (!acc) return <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" aria-label="Loading your Meta accounts" />;
  if ("error" in acc) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-destructive" role="alert">{acc.error}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onRecheck} disabled={checking}>{checking ? <Loader2 className="animate-spin" /> : <RefreshCw />} Try again</Button>
          <Button variant="ghost" onClick={onDisconnect}>Reconnect</Button>
        </div>
      </div>
    );
  }
  const readiness = currentReadiness(status, adAccountId);
  const noAccounts = acc.adAccounts.length === 0;
  return (
    <div className="space-y-4 text-sm">
      <MetaAccountPicker adAccounts={acc.adAccounts} pages={acc.pages} adAccountId={adAccountId} pageId={pageId} onAdAccount={onAdAccount} onPage={onPage} />

      {readiness && (readiness.ok && adAccountId && pageId ? (
        <p className="flex items-center gap-2 text-foreground"><CheckCircle2 className="size-4 text-primary" /> This account is ready to publish.</p>
      ) : readiness.issues.length > 0 ? (
        <ul className="space-y-2" aria-live="polite">
          {readiness.issues.map((i) => (
            <li key={i.code} className="flex gap-2 rounded-md border border-border bg-card/50 px-3 py-2">
              <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span className="min-w-0 space-y-1">
                <span className="block">{i.text}</span>
                <a className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" href={i.fixUrl} target="_blank" rel="noreferrer">
                  {i.fixLabel} <ExternalLink className="size-3.5" />
                </a>
              </span>
            </li>
          ))}
        </ul>
      ) : null)}

      {noAccounts && (
        <div className="space-y-1 rounded-md bg-muted/50 px-3 py-2 text-muted-foreground">
          <p className="font-medium text-foreground">{NO_AD_ACCOUNT_HELP.title}</p>
          <p>{NO_AD_ACCOUNT_HELP.text}</p>
          <p>Prefer to do it yourself? Use Download all on this page and follow &ldquo;{LAUNCH_GUIDE_TITLE}&rdquo;.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onRecheck} disabled={checking}>{checking ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check again</Button>
        <Button variant="ghost" size="sm" onClick={onDisconnect}>Disconnect</Button>
      </div>
    </div>
  );
}
