"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Shown when the trial needs a verified email. `onContinue` retries after the user clicked the link. */
export function VerifyEmailNotice({ email, onContinue }: { email?: string; onContinue: () => void }) {
  const [sending, setSending] = useState(false);

  async function resend() {
    setSending(true);
    const res = await fetch("/api/auth/verify-email", { method: "POST" }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setSending(false);
    if (res?.ok) toast.success("Sent. Check your inbox.");
    else toast.error(data?.error ?? "Couldn't send the email. Try again.");
  }

  return (
    <Card className="w-full pt-8 text-center">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl">Check your inbox</CardTitle>
        <CardDescription className="text-base">
          Ozzy sent a magic link to {email ?? "your email"}. Click it to unlock your free ads, then come back here. Your website is saved.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" className="sm:flex-1" onClick={onContinue}>I&apos;ve confirmed it</Button>
        <Button size="lg" variant="outline" className="sm:flex-1" onClick={resend} disabled={sending}>{sending ? "Sending…" : "Resend email"}</Button>
      </CardContent>
      <p className="px-6 pb-2 text-xs text-muted-foreground">Can&apos;t find it? Check spam or promotions.</p>
    </Card>
  );
}
