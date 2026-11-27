"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { GoogleAccount } from "@/lib/ads/google/client-api";
import { ErrorNote } from "./error-note";
import { formatCustomerId } from "./logic";

export function AccountPickerStep({
  accounts, error, selectedId, selecting, onSelect, onRetry, onCreateInstead,
}: {
  accounts: GoogleAccount[] | null;
  error: string | null;
  selectedId: string | null;
  selecting: string | null;
  onSelect: (a: GoogleAccount) => void;
  onRetry: () => void;
  onCreateInstead: () => void;
}) {
  if (error) return <ErrorNote message={error} action={{ label: "Try again", onClick: onRetry }} />;
  if (!accounts) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading your Google Ads accounts">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }
  if (accounts.length === 0) {
    return (
      <div className="space-y-3 rounded-md bg-muted/50 px-3 py-3 text-sm">
        <p className="font-medium">This Google login has no Google Ads account we can use.</p>
        <p className="text-muted-foreground">Sign in with the login you use for Google Ads, or let Komendly create an account for you.</p>
        <Button size="sm" onClick={onCreateInstead}>Set up another way</Button>
      </div>
    );
  }
  return (
    <fieldset className="space-y-2 text-sm">
      <legend className="mb-1.5 font-medium">Which Google Ads account should we use?</legend>
      {accounts.map((a) => {
        const on = a.customerId === selectedId;
        return (
          <label key={a.customerId} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 ${on ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}>
            <input type="radio" name="google-account" className="accent-primary" checked={on} disabled={!!selecting} onChange={() => onSelect(a)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{a.name || "Unnamed account"}</span>
              <span className="block text-xs text-muted-foreground">{formatCustomerId(a.customerId)} · {a.currency}</span>
            </span>
            {a.test && <Badge variant="outline">Test account</Badge>}
            {selecting === a.customerId && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" />}
          </label>
        );
      })}
      <p className="text-xs text-muted-foreground">Test accounts never show ads to real people.</p>
    </fieldset>
  );
}
