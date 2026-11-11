"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { AuthCard, AuthField } from "@/components/testimonials/auth-card";
import type { OzzyMood } from "@/components/testimonials/ozzy-perch";
import { track } from "@/lib/analytics/track";
import { FIRST_VIDEO_OFFER, formatUsd, GUARANTEE } from "@/lib/first-video-offer";
import { startFirstVideoCheckout } from "@/lib/testimonial-checkout";
import { loadDraft, type TestimonialDraft } from "@/lib/testimonial-draft";
import { OzzyAuth } from "@/components/hub/ozzy-auth";

const PLAN_KEYS = ["starter", "pro", "enterprise"] as const;

function RegisterContent() {
  const router = useRouter();
  const params = useSearchParams();
  const plan = PLAN_KEYS.find((k) => k === params.get("plan"));
  const billing = params.get("billing") === "yearly" ? "yearly" : "monthly";
  const [draft, setDraft] = useState<TestimonialDraft | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "account" | "checkout">("form");

  useEffect(() => {
    const d = loadDraft();
    // localStorage is client-only: read the draft after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(d);
    track("signup_view", { product: "testimonials", flow: plan ? "plan" : d ? "first_video" : "direct" });
  }, [plan]);

  // Offer flow = no plan picked. With a draft we go straight to the Launch Kit checkout.
  const offerFlow = !plan;
  const mood: OzzyMood =
    step === "checkout"
      ? { form: "creator", expression: "excited", motion: "hop", line: "Off to checkout. Back in a tick!" }
      : error
        ? { form: "classic", expression: "confused", motion: "think" }
        : draft
          ? { form: "joyful", expression: "happy", motion: "wave", line: "Got your review safe. Nearly there!" }
          : { form: "classic", expression: "happy", motion: "wave" };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setStep("account");
    try {
      // One sign-up for every app: the ads endpoint records attribution, referrals, Studio invites and email verification.
      const res = await fetch("/api/ads/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, ...(params.get("ref") ? { ref: params.get("ref") } : {}) }),
      });
      const err = (await res.clone().json().catch(() => ({}))) as { error?: string | { message?: string }; message?: string };
      const me = res.ok ? ((await (await fetch("/api/auth/me")).json().catch(() => ({}))) as { user?: { id: string; email: string } }) : {};
      const data: { user?: { id: string; email: string }; redirectTo?: string } = { user: me.user, redirectTo: "/dashboard" };
      if (!res.ok || !data.user) {
        const msg = typeof err.error === "string" ? err.error : err.error?.message ?? err.message;
        setError(msg || "Registration failed. Please try again.");
        setStep("form");
        return;
      }
      track("sign_up", { product: "testimonials", method: "email", flow: offerFlow ? "first_video" : "plan" });
      setStep("checkout");

      if (plan) {
        const r = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planKey: plan, userId: data.user.id, email: data.user.email, billingCycle: billing }),
        });
        const c = (await r.json().catch(() => ({}))) as { url?: string };
        if (r.ok && c.url) {
          track("begin_checkout", { product: "testimonials", plan, billing });
          window.location.assign(c.url);
          return;
        }
      } else {
        const started = await startFirstVideoCheckout(data.user.id, data.user.email);
        if (started.ok) return;
      }
      // Fallback: let them choose on the pricing page.
      router.push(data.redirectTo ?? "/pricing");
    } catch {
      setError("Something went wrong. Please try again.");
      setStep("form");
    }
  }

  const busy = step !== "form";
  if (!plan && !draft && params.get("flow") !== "first_video") return <div className="min-h-screen text-foreground"><SiteHeader cta={false} /><OzzyAuth mode="signup" /></div>;
  const loginHref = "/login";

  return (
    <div className="min-h-screen text-foreground">
      <SiteHeader cta={false} />
      <AuthCard
        title={offerFlow ? "One quick step" : "Create your account"}
        description={
          offerFlow ? (
            <>Create your account, then pay {formatUsd(FIRST_VIDEO_OFFER.priceCents)} once and we start filming{draft ? " your review" : ""}.</>
          ) : (
            <>Then you&apos;ll go straight to secure checkout for {plan ? plan[0]?.toUpperCase() + plan.slice(1) : "your plan"}.</>
          )
        }
        mood={mood}
        error={error}
        aside={
          draft ? (
            <div className="rounded-2xl border border-border bg-[oklch(0.2_0.07_295/0.5)] p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Your review</p>
              <p className="mt-2 line-clamp-3 text-sm italic text-foreground/90">&ldquo;{draft.reviewText}&rdquo;</p>
              <p className="mt-2 text-xs text-muted-foreground">{draft.length}s video · {draft.gender === "any" ? "best-match presenter" : draft.gender === "female" ? "female presenter" : "male presenter"} · <Link href="/testimonials#start" className="underline underline-offset-2 hover:text-foreground">edit</Link></p>
            </div>
          ) : null
        }
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <AuthField id="name" label="Your name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
          <AuthField id="email" label="Email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
          <AuthField id="password" label="Password" type="password" autoComplete="new-password" minLength={8} required hint="At least 8 characters." value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
          <button type="submit" disabled={busy} className="spellbar__cta inline-flex h-12 w-full items-center justify-center rounded-2xl text-base font-semibold disabled:opacity-70">
            {busy ? (<><Loader2 aria-hidden className="mr-2 size-5 animate-spin" />{step === "account" ? "Creating account…" : "Opening secure checkout…"}</>) : offerFlow ? `Continue to payment: ${formatUsd(FIRST_VIDEO_OFFER.priceCents)}` : "Continue to checkout"}
          </button>
          {offerFlow ? <p className="text-center text-xs text-muted-foreground">One-time payment, no subscription. {GUARANTEE}</p> : null}
          <p className="text-center text-sm text-muted-foreground">
            Already have an account? <Link href={loginHref} className="font-medium text-[var(--studio-gold)] underline-offset-2 hover:underline">Sign in</Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            By signing up you agree to our <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">Terms</Link> and <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>.
          </p>
        </form>
      </AuthCard>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <RegisterContent />
    </Suspense>
  );
}
