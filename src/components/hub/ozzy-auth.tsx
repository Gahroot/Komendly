"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthCard, AuthField } from "@/components/testimonials/auth-card";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { postJson } from "@/lib/ads/run-client";
import { track } from "@/lib/analytics/track";
import { safeAppNext } from "@/lib/hub/safe-next";
import { loadDraft } from "@/lib/testimonial-draft";

/**
 * The one Ozzy front door for every app (/login, /register, /ads/login, /ads/signup).
 * Uses the ads auth API: signup records first-touch attribution, referrals, the Studio invite cookie and sends
 * the verification email. Lands on ?next (same-origin only) or /dashboard.
 */
export function OzzyAuth({ mode, referrerName, freeStatic = 10 }: { mode: "login" | "signup"; referrerName?: string; freeStatic?: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeAppNext(params.get("next") ?? params.get("redirect"));
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSignup = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ref = params.get("ref");
      await postJson(`/api/ads/auth/${mode}`, isSignup ? { ...form, ...(ref ? { ref } : {}) } : { email: form.email, password: form.password });
      track(isSignup ? "sign_up" : "login", { method: "email", has_pending_run: next.startsWith("/ads/start") });
      // A testimonial review drafted on /testimonials before signing in resumes in the create flow.
      const hasNext = Boolean(params.get("next") ?? params.get("redirect"));
      router.push(!hasNext && !isSignup && loadDraft() ? "/dashboard/create-fal?from=draft" : next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const q = params.get("next") ? `?next=${encodeURIComponent(next)}` : "";
  const other = isSignup ? `/login${q}` : `/register${q}`;
  const title = isSignup ? (referrerName ? `${referrerName} sent you free ads` : "Meet Ozzy") : "Welcome back";
  const description = isSignup
    ? referrerName
      ? `${freeStatic} static ads + 1 animated ad from your website, free. No card needed.`
      : "Ozzy makes your ads, videos and testimonials. Start free: a pack of ads and your first Studio video, no card needed."
    : params.get("verified") === "1"
      ? "Your email is confirmed. Sign in and Ozzy will get cracking."
      : "Sign in to Ozzy: your ads, videos and testimonials in one place.";

  return (
    <AuthCard
      title={title}
      description={description}
      mood={error ? { form: "classic", expression: "confused", motion: "think" } : { form: "classic", expression: "happy", motion: "wave", line: isSignup ? "G'day! I'm Ozzy." : "G'day again!" }}
      error={error}
    >
      {isSignup ? <TrackOnMount event="signup_view" params={{ has_pending_run: next.startsWith("/ads/start") }} /> : null}
      <form onSubmit={submit} className="space-y-4">
        {isSignup ? <AuthField id="name" label="Your name" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={busy} /> : null}
        <AuthField id="email" label="Email" type="email" autoComplete="email" inputMode="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={busy} />
        <AuthField
          id="password"
          label="Password"
          type="password"
          required
          minLength={isSignup ? 8 : 1}
          hint={isSignup ? "At least 8 characters." : undefined}
          autoComplete={isSignup ? "new-password" : "current-password"}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          disabled={busy}
        />
        <button type="submit" disabled={busy} className="spellbar__cta inline-flex h-12 w-full items-center justify-center rounded-2xl text-base font-semibold disabled:opacity-70">
          {busy ? <Loader2 aria-hidden className="mr-2 size-5 animate-spin" /> : null}
          {isSignup ? "Create my free account" : "Sign in"}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          {isSignup ? "Already have an account? " : "New here? "}
          <Link href={other} className="font-medium text-[var(--studio-gold)] underline-offset-2 hover:underline">{isSignup ? "Sign in" : "Create an account"}</Link>
        </p>
        <p className="text-center text-xs text-muted-foreground">
          By {isSignup ? "signing up" : "signing in"} you agree to our <Link className="underline underline-offset-2 hover:text-foreground" href="/terms">Terms</Link> and <Link className="underline underline-offset-2 hover:text-foreground" href="/privacy">Privacy Policy</Link>.
        </p>
      </form>
    </AuthCard>
  );
}
