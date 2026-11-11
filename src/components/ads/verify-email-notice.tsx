"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

async function post(url: string, body?: unknown): Promise<{ ok: boolean; data: { error?: string; email?: string; alreadyVerified?: boolean } }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const data = ((await res?.json().catch(() => ({}))) ?? {}) as { error?: string; email?: string; alreadyVerified?: boolean };
  return { ok: Boolean(res?.ok), data };
}

/**
 * Shown when the trial needs a verified email. The 6-digit code works in this same browser
 * (Facebook/Instagram in-app browsers open email links elsewhere). `onContinue` retries the run.
 */
export function VerifyEmailNotice({ email: initialEmail, onContinue, title = "Check your inbox", purpose = "to unlock your free ads. Your website is saved" }: { email?: string; onContinue: () => void; title?: string; purpose?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<null | "code" | "resend" | "change">(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    if (initialEmail) return;
    void fetch("/api/auth/verify-email")
      .then((r) => (r.ok ? (r.json() as Promise<{ email?: string }>) : null))
      .then((d) => d?.email && setEmail(d.email))
      .catch(() => undefined);
  }, [initialEmail]);

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy("code");
    setCodeError(null);
    const { ok, data } = await post("/api/auth/verify-email/code", { code });
    setBusy(null);
    if (ok) {
      toast.success("Email confirmed!");
      onContinue();
    } else setCodeError(data.error ?? "That code didn't work. Try again.");
  }

  async function resend() {
    setBusy("resend");
    const { ok, data } = await post("/api/auth/verify-email");
    setBusy(null);
    if (data.alreadyVerified) return onContinue();
    if (ok) {
      setCode("");
      setCodeError(null);
      toast.success("Sent a new code. Check your inbox and spam.");
    } else toast.error(data.error ?? "Couldn't send the email. Try again.");
  }

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy("change");
    const { ok, data } = await post("/api/auth/verify-email/change-email", { email: newEmail });
    setBusy(null);
    if (ok) {
      setEmail(data.email ?? newEmail);
      setChanging(false);
      setCode("");
      setCodeError(null);
      toast.success("Updated. We sent a new code there.");
    } else toast.error(data.error ?? "Couldn't change the email. Try again.");
  }

  return (
    <Card className="w-full pt-8 text-center">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription className="text-base">
          Ozzy sent a 6-digit code to {email ?? "your email"}. Type it here {purpose}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={submitCode} className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 \-]*"
            maxLength={7}
            placeholder="123456"
            className="h-11 text-center text-lg tracking-[0.3em] sm:flex-1"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" size="lg" className="sm:flex-1" disabled={busy !== null || code.replace(/\D/g, "").length !== 6}>
            {busy === "code" ? "Checking…" : "Confirm code"}
          </Button>
        </form>
        {codeError && <p role="alert" className="text-sm text-destructive">{codeError}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" variant="outline" className="sm:flex-1" onClick={() => void resend()} disabled={busy !== null}>{busy === "resend" ? "Sending…" : "Resend email"}</Button>
          <Button size="lg" variant="ghost" className="sm:flex-1" onClick={onContinue}>I clicked the link</Button>
        </div>
        {changing ? (
          <form onSubmit={changeEmail} className="flex flex-col gap-2 sm:flex-row">
            <Input type="email" required aria-label="Correct email" placeholder="you@example.com" className="h-10 sm:flex-1" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <Button type="submit" variant="outline" disabled={busy !== null}>{busy === "change" ? "Saving…" : "Send code there"}</Button>
          </form>
        ) : (
          <button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={() => setChanging(true)}>Wrong email? Change it</button>
        )}
      </CardContent>
      <p className="px-6 pb-2 text-xs text-muted-foreground">Can&apos;t find it? Check spam or promotions. The subject starts with &quot;Your Komendly code&quot;.</p>
    </Card>
  );
}
