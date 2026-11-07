"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";
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
    <Card className="w-full max-w-md bg-card/70 backdrop-blur">
      <CardHeader>
        <MailCheck className="size-6 text-muted-foreground" />
        <CardTitle>Confirm your email to unlock your free ads</CardTitle>
        <CardDescription>
          We sent a link to {email ?? "your inbox"}. Click it, then come back here. Your website is saved.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={onContinue}>I&apos;ve confirmed it</Button>
        <Button variant="outline" onClick={resend} disabled={sending}>Resend email</Button>
      </CardContent>
    </Card>
  );
}
