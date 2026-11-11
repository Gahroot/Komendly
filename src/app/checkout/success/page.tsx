"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { OzzyPerch, type OzzyMood } from "@/components/testimonials/ozzy-perch";
import { trackOnce } from "@/lib/analytics/track";
import { PLAN_CONFIG, type PlanKey } from "@/lib/stripe-config";
import { loadDraft } from "@/lib/testimonial-draft";
import { FIRST_VIDEO_OFFER, GUARANTEE, VIDEO_PACK_OFFER, videosLabel } from "@/lib/first-video-offer";

interface VerifiedUser {
  id: string;
  email?: string;
  name?: string;
  plan?: string;
  minutesLimit?: number;
}
interface VerifyResponse {
  success?: boolean;
  error?: string;
  user?: VerifiedUser;
  purchase?: { offer: string; minutes: number; amount: number; signedIn: boolean };
}

function getCookie(name: string): string | undefined {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : undefined;
}

function planValue(plan: string | undefined): number {
  return plan && plan in PLAN_CONFIG ? PLAN_CONFIG[plan as PlanKey].monthlyPrice : 0;
}

function CheckoutSuccessContent() {
  const router = useRouter();
  const sessionId = useSearchParams().get("session_id");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [info, setInfo] = useState<{ title: string; detail: string; next: string; nextLabel: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!sessionId) {
      setStatus("error");
      setError("No checkout session found.");
      return;
    }

    (async () => {
      try {
        // Server verifies the paid session and syncs it directly (idempotent with the webhook).
        const res = await fetch(`/api/stripe/checkout?session_id=${encodeURIComponent(sessionId)}`);
        const data = (await res.json()) as VerifyResponse;
        if (!res.ok || !data.success || !data.user) throw new Error(data.error || "We couldn't confirm your payment yet.");
        const user = data.user;
        const purchase = data.purchase;
        const value = purchase ? purchase.amount : planValue(user.plan);

        trackOnce(`purchase:${sessionId}`, "purchase", {
          product: "testimonials",
          offer: purchase?.offer,
          plan: purchase ? undefined : user.plan,
          value,
          currency: "USD",
          transaction_id: sessionId,
        });
        fetch("/api/facebook-capi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: "Purchase",
            email: user.email,
            value,
            currency: "USD",
            transactionId: sessionId,
            contentName: purchase ? (purchase.offer === FIRST_VIDEO_OFFER.key ? FIRST_VIDEO_OFFER.name : purchase.offer === VIDEO_PACK_OFFER.key ? VIDEO_PACK_OFFER.name : "Video pack") : `${user.plan} Plan`,
            sourceUrl: window.location.href,
            fbc: getCookie("_fbc"),
            fbp: getCookie("_fbp"),
          }),
        }).catch(() => undefined);

        // Subscriptions sign in via login-after-payment; one-time purchases are signed in by the verify call.
        if (!purchase?.signedIn) {
          const login = await fetch("/api/auth/login-after-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id }),
          });
          if (!login.ok) throw new Error("Payment confirmed, but we couldn't sign you in. Please sign in with your email and password.");
        }

        const hasDraft = loadDraft() !== null;
        const next = hasDraft ? "/dashboard/create-fal/generate?from=draft" : "/dashboard/create-fal";
        setInfo({
          title: purchase ? "Paid. Let's film it." : "You're in!",
          detail: purchase
            ? `${videosLabel(purchase.minutes)} (up to 60s each) on your account.${hasDraft ? " Starting your video now…" : ""}`
            : `Your ${user.plan} plan is active with ${videosLabel(user.minutesLimit ?? 0)} this month.${hasDraft ? " Starting your video now…" : ""}`,
          next,
          nextLabel: hasDraft ? "Start my video" : "Make a video",
        });
        setStatus("success");
        if (hasDraft) router.replace(next);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    })();
  }, [sessionId, router]);

  const mood: OzzyMood =
    status === "loading"
      ? { form: "explorer", expression: "focused", motion: "scan", line: "Checking with the bank…" }
      : status === "success"
        ? { form: "ascended", expression: "excited", motion: "celebrate", line: "Payment's in. Let's go!" }
        : { form: "classic", expression: "confused", motion: "think" };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-16 text-foreground">
      <div className="relative w-full max-w-md">
        <OzzyPerch mood={mood} size={88} className="absolute -top-[82px] left-4 z-10" />
        <div className="pixel-frame bg-[linear-gradient(180deg,oklch(0.24_0.08_295/.94),oklch(0.17_0.07_292/.94))] p-8 text-center" aria-live="polite">
          {status === "loading" ? (
            <>
              <Loader2 aria-hidden className="mx-auto size-10 animate-spin text-[var(--studio-gold)]" />
              <h1 className="font-display mt-4 text-2xl font-medium">Confirming your payment…</h1>
              <p className="mt-2 text-sm text-muted-foreground">This usually takes a second or two.</p>
            </>
          ) : status === "error" ? (
            <>
              <h1 className="font-display text-2xl font-medium">We hit a snag</h1>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              <p className="mt-2 text-xs text-muted-foreground">If you were charged, your videos are safe: they&apos;re added as soon as Stripe confirms.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/login" className="spellbar__cta inline-flex h-11 items-center rounded-2xl px-5 font-semibold">Sign in</Link>
                <Link href="/pricing" className="inline-flex h-11 items-center rounded-2xl border border-border px-5 font-medium hover:bg-accent">Back to pricing</Link>
              </div>
            </>
          ) : info ? (
            <>
              <h1 className="font-display text-3xl font-medium">{info.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{info.detail}</p>
              <Link href={info.next} className="spellbar__cta mt-6 inline-flex h-12 items-center rounded-2xl px-6 font-semibold">{info.nextLabel}</Link>
            </>
          ) : null}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">{GUARANTEE}</p>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <CheckoutSuccessContent />
    </Suspense>
  );
}
