"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock, Loader2 } from "lucide-react";
import { ActorGrid } from "@/components/testimonials/create/actor-grid";
import { fetchActors, pickDefaultActor, type StudioActor } from "@/components/testimonials/create/actors";
import { CreateSteps, StepTitle } from "@/components/testimonials/create/create-steps";
import { OutOfMinutes } from "@/components/testimonials/create/offer-gate";
import { useUser } from "@/hooks/useUser";
import { loadFlow, saveFlow, type CreateFlow } from "@/lib/create-flow";
import { saveDraft, type DraftLength } from "@/lib/testimonial-draft";

const LENGTHS: { id: DraftLength; label: string; minutes: number; hint: string }[] = [
  { id: "30", label: "30 seconds", minutes: 1, hint: "Punchy, for Reels and Shorts" },
  { id: "60", label: "60 seconds", minutes: 1, hint: "The whole story" },
];

export default function StylePage() {
  const router = useRouter();
  const { user } = useUser();
  const [flow, setFlow] = useState<CreateFlow | null>(null);
  const [actors, setActors] = useState<StudioActor[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const f = loadFlow();
    if (!f) {
      router.replace("/dashboard/create-fal");
      return;
    }
    const ac = new AbortController();
    fetchActors(f.reviewId, ac.signal)
      .then((list) => {
        setActors(list);
        const d = list.some((a) => a.id === f.actorId) ? undefined : pickDefaultActor(list, f.gender);
        setFlow(d ? { ...f, actorId: d.id, actorName: d.name } : f);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setFlow(f);
        setLoadError(e instanceof Error ? e.message : "Couldn't load presenters");
      });
    return () => ac.abort();
  }, [router]);

  useEffect(() => {
    if (flow) saveFlow(flow);
  }, [flow]);

  if (!flow) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground" role="status">
        <Loader2 aria-hidden className="size-5 animate-spin" />Loading presenters…
      </div>
    );
  }

  const remaining = user ? Math.max(0, user.minutesLimit - user.minutesUsed) : null;
  const need = LENGTHS.find((l) => l.id === flow.length)?.minutes ?? 1;
  const outOfMinutes = remaining !== null && remaining < need;

  function keepAsDraft() {
    if (!flow) return;
    saveDraft({ reviewText: flow.reviewText, businessName: flow.businessName, reviewerName: flow.reviewerName, rating: flow.rating, gender: flow.gender, length: flow.length, actorId: flow.actorId });
  }

  return (
    <div className="space-y-8">
      <div className="mx-auto max-w-3xl"><CreateSteps current={2} /></div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <StepTitle kicker="Step 2 of 3" title="Who should say it?">
          Pick the presenter who fits your customers.
        </StepTitle>
        <Link href="/dashboard/create-fal" className="inline-flex h-10 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden className="size-4" /> Edit review
        </Link>
      </div>

      <blockquote className="rounded-2xl border border-border bg-[oklch(0.2_0.07_295/0.5)] p-4 text-sm">
        <p className="line-clamp-3 italic text-foreground/90">&ldquo;{flow.reviewText}&rdquo;</p>
        <footer className="mt-2 text-xs text-muted-foreground">{flow.reviewerName} · {flow.businessName}</footer>
      </blockquote>

      <section aria-labelledby="presenter-h" className="space-y-3">
        <h2 id="presenter-h" className="font-display text-xl font-medium">Presenter</h2>
        {loadError ? (
          <p role="alert" className="text-sm text-[oklch(0.86_0.1_25)]">{loadError}. Refresh to try again.</p>
        ) : !actors ? (
          <div className="flex items-center gap-2 py-10 text-muted-foreground" role="status"><Loader2 aria-hidden className="size-5 animate-spin" />Loading presenters…</div>
        ) : (
          <ActorGrid
            actors={actors}
            selectedId={flow.actorId}
            onSelect={(a) => setFlow({ ...flow, actorId: a.id, actorName: a.name })}
            gender={flow.gender}
            onGender={(g) => setFlow({ ...flow, gender: g })}
          />
        )}
      </section>

      <section aria-labelledby="length-h" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="length-h" className="font-display text-xl font-medium">Length</h2>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock aria-hidden className="size-4" />
            {remaining === null ? "…" : <><span className="font-medium tabular-nums text-foreground">{remaining}</span> video{remaining === 1 ? "" : "s"} left (up to 60s each)</>}
          </p>
        </div>
        <div role="radiogroup" aria-label="Video length" className="grid gap-3 sm:grid-cols-2">
          {LENGTHS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={flow.length === l.id} onClick={() => setFlow({ ...flow, length: l.id })} className="spell-chip flex items-center justify-between rounded-2xl p-4 text-left">
              <span>
                <span className="block font-medium">{l.label}</span>
                <span className="block text-xs opacity-80">{l.hint}</span>
              </span>
              <span className="text-xs tabular-nums opacity-80">uses {l.minutes} video</span>
            </button>
          ))}
        </div>
      </section>

      {outOfMinutes ? (
        <section aria-label="Get minutes" className="mx-auto max-w-3xl">
          <OutOfMinutes user={user} placement="create_style" onBeforeCheckout={keepAsDraft} />
        </section>
      ) : (
        <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-border bg-[oklch(0.14_0.06_290/0.85)] px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <button
            type="button"
            disabled={!flow.actorId}
            onClick={() => router.push("/dashboard/create-fal/generate?start=1")}
            className="spellbar__cta inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-6 font-semibold disabled:opacity-60 sm:w-auto"
          >
            Film my video{flow.actorName ? ` with ${flow.actorName}` : ""}
            <ArrowRight aria-hidden className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
