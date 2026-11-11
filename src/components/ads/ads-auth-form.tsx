"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postJson, safeNext } from "@/lib/ads/run-client";
import { track } from "@/lib/analytics/track";
import { TrackOnMount } from "@/components/analytics/track-on-mount";

export function AdsAuthForm({ mode, referrerName }: { mode: "signup" | "login"; referrerName?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSignup = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/ads/auth/${mode}`, isSignup ? { ...form, ...(params.get("ref") ? { ref: params.get("ref") } : {}) } : { email: form.email, password: form.password });
      track(isSignup ? "sign_up" : "login", { method: "email", has_pending_run: next.startsWith("/ads/start") });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const other = isSignup ? "/ads/login" : "/ads/signup";
  return (
    <Card className="w-full max-w-md">
      {isSignup && <TrackOnMount event="signup_view" params={{ has_pending_run: next.startsWith("/ads/start") }} />}
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-semibold tracking-tight">{isSignup ? (referrerName ? `${referrerName} sent you 20 free ads` : "Create your free account") : "Welcome back"}</CardTitle>
        <CardDescription>
          {isSignup ? (referrerName ? "20 static ads + 1 animated ad from your website, free. Double the usual pack. No card needed." : "10 static ads + 1 animated ad, free. No card needed.") : params.get("verified") === "1" ? "Your email is confirmed. Sign in to get your free ads." : "Sign in to continue to your ads."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          {isSignup && (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={isSignup ? 8 : 1}
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {isSignup ? "Create account" : "Sign in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {isSignup ? "Already have an account? " : "New here? "}
            <Link className="text-foreground underline underline-offset-4" href={`${other}?next=${encodeURIComponent(next)}`}>
              {isSignup ? "Sign in" : "Create one"}
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            By {isSignup ? "signing up" : "signing in"} you agree to our <Link className="underline underline-offset-2 hover:text-foreground" href="/terms">Terms</Link> and <Link className="underline underline-offset-2 hover:text-foreground" href="/privacy">Privacy Policy</Link>.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
