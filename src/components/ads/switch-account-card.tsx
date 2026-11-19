"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Shown when a signed-in user opens a link to an ad pack (or other page) owned by another Komendly account. */
export function SwitchAccountCard({ email, next }: { email: string; next: string }) {
  const [busy, setBusy] = useState(false);
  async function switchAccount() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = `/ads/login?next=${encodeURIComponent(next)}`;
  }
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
      <h1 className="text-xl font-semibold">These ads belong to another account</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        You&apos;re signed in as <span className="font-medium text-foreground">{email}</span>, but this ad pack was made with a different Komendly account
        (for example the one you connected to ChatGPT, Claude or Shopify).
      </p>
      <Button className="mt-5 w-full" onClick={switchAccount} disabled={busy}>
        {busy ? "Signing out..." : "Sign in with the other account"}
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">You&apos;ll come straight back to these ads after signing in.</p>
    </div>
  );
}
