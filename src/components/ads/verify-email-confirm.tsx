"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
import { ozzy } from "@/components/ozzy/store";
import { readPendingRun } from "@/lib/ads/run-client";

type State = "checking" | "ok" | "expired" | "invalid";

const COPY: Record<State, { title: string; text: string }> = {
  checking: { title: "Checking your link…", text: "Ozzy is reading the magic words." },
  ok: { title: "You're confirmed!", text: "Your free ads are unlocked: 10 static ads and an animated one." },
  expired: { title: "That link has expired", text: "Links last 24 hours. Grab a fresh one and you're straight back in." },
  invalid: { title: "That link didn't work", text: "It may have been used already, or copied only partly. If you're already confirmed, just carry on." },
};

/** Lands from the confirmation email: confirms the token, then sends the user on to their ads. */
export function VerifyEmailConfirm({ signedIn }: { signedIn: boolean }) {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<State>(token ? "checking" : "invalid");
  const [sending, setSending] = useState(false);
  // Read on the client only (the button renders after the async confirm, so no hydration mismatch).
  const [hasPending] = useState(() => typeof window !== "undefined" && Boolean(readPendingRun()));
  const router = useRouter();
  const sent = useRef(false);

  useEffect(() => {
    if (!token) {
      ozzy.emit({ type: "error", kind: "auth" });
      return;
    }
    if (sent.current) return;
    sent.current = true;
    ozzy.emit({ type: "analysis:start" });
    void fetch("/api/auth/verify-email/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
        const next: State = data.ok ? "ok" : data.reason === "expired" ? "expired" : "invalid";
        setState(next);
        ozzy.emit(next === "ok" ? { type: "generation:done" } : { type: "error", kind: "auth" });
      })
      .catch(() => {
        setState("invalid");
        ozzy.emit({ type: "error", kind: "network" });
      });
  }, [token]);

  async function resend() {
    setSending(true);
    const res = await fetch("/api/auth/verify-email", { method: "POST" }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { error?: string; alreadyVerified?: boolean } | undefined;
    setSending(false);
    if (res?.status === 401) return router.push(`/ads/login?next=${encodeURIComponent("/ads/app")}`);
    if (data?.alreadyVerified) return router.push(readPendingRun() ? "/ads/start" : "/ads/app");
    if (res?.ok) toast.success("Sent! Check your inbox (and spam, just in case).");
    else toast.error(data?.error ?? "Couldn't send the email. Try again.");
  }

  const continueHref = hasPending ? "/ads/start" : "/ads/app";
  // Opened in another browser (e.g. from the Facebook in-app browser): confirmed, but this browser isn't signed in.
  const loginHref = `/ads/login?verified=1&next=${encodeURIComponent(continueHref)}`;
  const copy = state === "ok" && !signedIn
    ? { title: "You're confirmed!", text: "Your free ads are unlocked. Sign in here to get them, or go back to the app where you signed up and tap \"I clicked the link\"." }
    : COPY[state];
  return (
    <div className="flex w-full max-w-md flex-col items-center">
      <div className="relative z-10 -mb-5"><OzzyLazy size={136} perch="ledge" speech={false} /></div>
      <div className="glass w-full rounded-3xl px-7 pb-8 pt-10 text-center" aria-live="polite">
        <h1 className="font-display flex items-center justify-center gap-2 text-3xl font-medium tracking-tight">
          {state === "checking" && <Loader2 className="size-5 animate-spin text-[var(--studio-gold)]" />}
          {copy.title}
        </h1>
        <p className="mt-3 text-muted-foreground">{copy.text}</p>
        {state === "ok" && (
          <Link href={signedIn ? continueHref : loginHref} className="spellbar__cta mt-7 inline-flex h-12 w-full items-center justify-center rounded-2xl font-semibold">
            {!signedIn ? "Sign in to get my ads" : hasPending ? "Start my ads" : "Continue to my ads"}
          </Link>
        )}
        {state === "expired" && (
          <button type="button" onClick={() => void resend()} disabled={sending} className="spellbar__cta mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-semibold disabled:opacity-80">
            {sending && <Loader2 className="size-4 animate-spin" />} Send me a new link
          </button>
        )}
        {state === "invalid" && (
          <div className="mt-7 flex flex-col gap-2 sm:flex-row">
            <Link href="/ads/app" className="spellbar__cta inline-flex h-12 items-center sm:flex-1 justify-center rounded-2xl font-semibold">Go to my ads</Link>
            <button type="button" onClick={() => void resend()} disabled={sending} className="inline-flex h-12 items-center justify-center rounded-2xl border sm:flex-1 border-border font-medium text-foreground transition-colors hover:bg-accent">Send a new link</button>
          </div>
        )}
      </div>
    </div>
  );
}
