"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Check, Download, Loader2, Plus, RefreshCw } from "lucide-react";
import { fetchActors, pickDefaultActor } from "@/components/testimonials/create/actors";
import { CreateSteps, StepTitle } from "@/components/testimonials/create/create-steps";
import { LaunchUpsell, OutOfMinutes } from "@/components/testimonials/create/offer-gate";
import { PriceSurvey } from "@/components/testimonials/price-survey";
import { OzzyPerch, type OzzyMood } from "@/components/testimonials/ozzy-perch";
import { useUser } from "@/hooks/useUser";
import { trackOnce } from "@/lib/analytics/track";
import { claimOnce, clearFlow, clipCounts, loadFlow, saveFlow, stageFromStatus, STAGES, type CreateFlow, type GenStage } from "@/lib/create-flow";
import type { FalGenerateStatusResponse } from "@/lib/fal-lipsync/types";
import { clearDraft, loadDraft, saveDraft } from "@/lib/testimonial-draft";
import { cn } from "@/lib/utils";

type Phase = "preparing" | "ready" | "starting" | "tracking" | "no_minutes" | "error";

const POLL_MS = 5000;

const STAGE_MOOD: Record<GenStage, OzzyMood> = {
  pending: { form: "classic", expression: "focused", motion: "nod", line: "You're in the queue. Won't be long." },
  script: { form: "creator", expression: "focused", motion: "think", line: "Writing the script from the review." },
  voicing: { form: "creator", expression: "focused", motion: "summon", line: "Recording the voice." },
  animating: { form: "creator", expression: "excited", motion: "summon", line: "Filming the presenter." },
  finishing: { form: "developer", expression: "focused", motion: "type", line: "Stitching it all together." },
  ready: { form: "joyful", expression: "excited", motion: "celebrate", line: "Beauty! Your video's ready." },
  failed: { form: "classic", expression: "confused", motion: "think", line: "That take didn't work. Sorry." },
};

function errorMessage(data: unknown, fallback: string): string {
  return typeof data === "object" && data !== null && typeof (data as { error?: unknown }).error === "string" ? (data as { error: string }).error : fallback;
}

function GenerateContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, refresh: refreshUser } = useUser();
  const [flow, setFlow] = useState<CreateFlow | null>(null);
  const [phase, setPhase] = useState<Phase>("preparing");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<FalGenerateStatusResponse | null>(null);
  const booted = useRef(false);

  const start = useCallback(
    async (f: CreateFlow) => {
      if (!f.actorId) return;
      setPhase("starting");
      setError(null);
      try {
        const res = await fetch("/api/fal-generate/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewId: f.reviewId, actorId: f.actorId, targetDuration: Number(f.length), aspectRatio: "9:16" }),
        });
        const data = (await res.json().catch(() => ({}))) as { compositeVideoId?: string; minutesReserved?: number; jobId?: string | null };
        if (res.status === 402) {
          setPhase("no_minutes");
          return;
        }
        if (!res.ok || !data.compositeVideoId) throw new Error(errorMessage(data, "Couldn't start the video"));
        const next = { ...f, compositeVideoId: data.compositeVideoId };
        saveFlow(next);
        setFlow(next);
        clearDraft();
        trackOnce(`testi_video_started_${data.compositeVideoId}`, "video_started", { product: "testimonials", length: f.length, minutes: data.minutesReserved });
        void refreshUser();
        setPhase("tracking");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't start the video");
        setPhase("error");
      }
    },
    [refreshUser],
  );

  // Boot: resume a running video, or build the run from the draft (after checkout) / the previous steps.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const fromDraft = params.get("from") === "draft";
    const wantsStart = params.get("start") === "1";
    (async () => {
      let f = loadFlow();
      const draft = fromDraft ? loadDraft() : null;
      if (draft && (!f || f.reviewText !== draft.reviewText)) f = null;
      if (f?.compositeVideoId) {
        setFlow(f);
        setPhase("tracking");
        return;
      }
      try {
        if (!f && draft) {
          const res = await fetch("/api/reviews", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reviewText: draft.reviewText, reviewerName: draft.reviewerName, businessName: draft.businessName, rating: draft.rating, source: "manual" }),
          });
          const data = (await res.json().catch(() => ({}))) as { review?: { id: string } };
          if (!res.ok || !data.review) throw new Error(errorMessage(data, "Couldn't save your review"));
          f = { reviewId: data.review.id, reviewText: draft.reviewText, businessName: draft.businessName, reviewerName: draft.reviewerName, rating: draft.rating, gender: draft.gender, length: draft.length, actorId: draft.actorId };
          saveFlow(f);
        }
        if (!f) {
          router.replace("/dashboard/create-fal");
          return;
        }
        if (!f.actorId) {
          const d = pickDefaultActor(await fetchActors(f.reviewId), f.gender);
          if (!d) throw new Error("No presenters are available right now");
          f = { ...f, actorId: d.id, actorName: d.name };
          saveFlow(f);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        setPhase("error");
        return;
      }
      setFlow(f);
      if (wantsStart || fromDraft) router.replace("/dashboard/create-fal/generate");
      // Auto-start once per tab; a refresh shows the button instead (the server also dedupes in-progress videos).
      const onceKey = fromDraft && draft ? `kmd_autostart_draft_${draft.savedAt}` : `kmd_autostart_${f.reviewId}_${f.actorId}_${f.length}`;
      if ((wantsStart || fromDraft) && claimOnce(onceKey)) void start(f);
      else setPhase("ready");
    })();
  }, [params, router, start]);

  // Poll the real status until it is final.
  const videoId = phase === "tracking" ? flow?.compositeVideoId : undefined;
  useEffect(() => {
    if (!videoId) return;
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const res = await fetch(`/api/fal-generate/status?id=${encodeURIComponent(videoId)}`, { signal: ac.signal, cache: "no-store" });
        if (res.status === 404) {
          clearFlow();
          setError("We couldn't find that video.");
          setPhase("error");
          return;
        }
        if (res.ok) {
          const s = (await res.json()) as FalGenerateStatusResponse;
          setStatus(s);
          const stage = stageFromStatus(s);
          if (stage === "ready") {
            trackOnce(`testi_video_ready_${videoId}`, "video_ready", { product: "testimonials", seconds: s.actualDuration });
            return;
          }
          if (stage === "failed") {
            trackOnce(`testi_video_failed_${videoId}`, "video_failed", { product: "testimonials", error: s.error?.slice(0, 80) });
            void refreshUser();
            return;
          }
        }
      } catch {
        if (ac.signal.aborted) return;
      }
      timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      ac.abort();
      if (timer) clearTimeout(timer);
    };
  }, [videoId, refreshUser]);

  function makeAnother() {
    clearFlow();
    router.push("/dashboard/create-fal");
  }

  function retry() {
    if (!flow) return;
    const fresh = { ...flow, compositeVideoId: undefined };
    saveFlow(fresh);
    setFlow(fresh);
    setStatus(null);
    void start(fresh);
  }

  function keepAsDraft() {
    if (!flow) return;
    saveDraft({ reviewText: flow.reviewText, businessName: flow.businessName, reviewerName: flow.reviewerName, rating: flow.rating, gender: flow.gender, length: flow.length, actorId: flow.actorId });
  }

  const stage: GenStage | null = phase === "tracking" ? (status ? stageFromStatus(status) : "pending") : null;
  const ready = stage === "ready" && status?.finalVideoUrl;
  const counts = status ? clipCounts(status) : { done: 0, total: 0 };
  const mood: OzzyMood = stage
    ? STAGE_MOOD[stage]
    : phase === "error"
      ? STAGE_MOOD.failed
      : phase === "no_minutes"
        ? { form: "classic", expression: "happy", motion: "nod", line: "One step left, then we film." }
        : { form: "classic", expression: "happy", motion: "idle" };
  const title = ready ? "Your video is ready" : stage === "failed" ? "That take didn't work" : phase === "no_minutes" ? "Get minutes to film" : phase === "tracking" ? "Filming your video" : "Ready to film";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="mx-auto max-w-3xl"><CreateSteps current={3} /></div>
      <StepTitle kicker="Step 3 of 3" title={title}>
        {phase === "tracking" && !ready && stage !== "failed" ? "You can leave this page. The video keeps filming and lands in your library." : null}
      </StepTitle>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative pt-20">
          <OzzyPerch mood={mood} size={84} className="absolute left-4 top-0 z-10" />
          <div className="overflow-hidden rounded-2xl border border-border bg-[oklch(0.2_0.07_295/0.62)] p-5 sm:p-6">
            {phase === "preparing" || phase === "starting" ? (
              <div role="status" className="flex min-h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 aria-hidden className="size-8 animate-spin text-[var(--studio-gold)]" />
                {phase === "starting" ? "Sending it to the studio…" : "Getting your review ready…"}
              </div>
            ) : phase === "ready" && flow ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
                <p className="max-w-sm text-muted-foreground">
                  {flow.actorName ?? "Your presenter"} will read a {flow.length}-second script based on this review.
                </p>
                <button type="button" onClick={() => void start(flow)} className="spellbar__cta inline-flex h-12 items-center justify-center rounded-xl px-6 font-semibold">
                  Start filming
                </button>
                <Link href="/dashboard/create-fal/style" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Change presenter or length</Link>
              </div>
            ) : phase === "no_minutes" ? (
              <OutOfMinutes user={user} placement="create_generate" onBeforeCheckout={keepAsDraft} />
            ) : phase === "error" ? (
              <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
                <AlertCircle aria-hidden className="size-10 text-[oklch(0.78_0.15_25)]" />
                <p className="max-w-sm text-muted-foreground">{error}</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {flow ? <button type="button" onClick={retry} className="spellbar__cta inline-flex h-11 items-center gap-2 rounded-xl px-5 font-semibold"><RefreshCw aria-hidden className="size-4" />Try again</button> : null}
                  <button type="button" onClick={makeAnother} className="spell-chip inline-flex h-11 items-center rounded-xl px-5">Start over</button>
                </div>
              </div>
            ) : ready ? (
              <div className="space-y-4">
                <video src={status?.finalVideoUrl} poster={status?.thumbnailUrl} controls playsInline className="mx-auto aspect-[9/16] max-h-[70vh] w-auto rounded-xl bg-black" />
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <a
                    href={`/api/download?url=${encodeURIComponent(status?.finalVideoUrl ?? "")}&filename=${encodeURIComponent(`testimonial-${status?.compositeVideoId ?? "video"}.mp4`)}`}
                    download
                    className="spellbar__cta inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 font-semibold"
                  >
                    <Download aria-hidden className="size-4" /> Download MP4
                  </a>
                  <button type="button" onClick={makeAnother} className="spell-chip inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6">
                    <Plus aria-hidden className="size-4" /> Make another
                  </button>
                </div>
              </div>
            ) : stage === "failed" ? (
              <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
                <AlertCircle aria-hidden className="size-10 text-[oklch(0.78_0.15_25)]" />
                <p className="max-w-sm text-muted-foreground">{status?.error ? `The studio reported: ${status.error}` : "The studio couldn't finish this one."} Reserved minutes are returned for failed videos.</p>
                <div className="flex flex-wrap justify-center gap-3">
                  <button type="button" onClick={retry} className="spellbar__cta inline-flex h-11 items-center gap-2 rounded-xl px-5 font-semibold"><RefreshCw aria-hidden className="size-4" />Try again</button>
                  <button type="button" onClick={makeAnother} className="spell-chip inline-flex h-11 items-center rounded-xl px-5">Start over</button>
                </div>
              </div>
            ) : (
              <ol className="space-y-1" aria-label="Progress">
                {STAGES.map((s) => {
                  const idx = STAGES.findIndex((x) => x.id === stage);
                  const me = STAGES.findIndex((x) => x.id === s.id);
                  const done = me < idx;
                  const current = me === idx;
                  return (
                    <li key={s.id} aria-current={current ? "step" : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5", current && "bg-[oklch(0.84_0.14_78/0.1)]")}>
                      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-xs", done && "border-[var(--studio-gold)] text-[var(--studio-gold)]", current && "border-transparent bg-[var(--studio-gold)] text-[#2a0f10]", !done && !current && "border-border text-muted-foreground")}>
                        {done ? <Check aria-hidden className="size-3.5" /> : current ? <span aria-hidden className="studio-dot size-2 rounded-full bg-[#2a0f10]" /> : null}
                      </span>
                      <span className={cn("flex-1", current ? "font-medium text-foreground" : done ? "text-foreground/80" : "text-muted-foreground")}>{s.label}</span>
                      {current && (s.id === "animating" || s.id === "voicing") && counts.total > 0 ? (
                        <span className="text-xs tabular-nums text-muted-foreground">{counts.done} of {counts.total} clips done</span>
                      ) : null}
                    </li>
                  );
                })}
                <li aria-hidden className="mx-3 mt-3 h-1 overflow-hidden rounded-full bg-[oklch(1_0_0/0.06)]"><div className="studio-shimmer h-full w-full" /></li>
              </ol>
            )}
          </div>
        </div>

        {flow ? (
          <aside className="space-y-4 lg:pt-20">
            <div className="rounded-2xl border border-border bg-[oklch(0.2_0.07_295/0.5)] p-5 text-sm">
              <h2 className="font-display text-lg font-medium">This video</h2>
              <dl className="mt-3 space-y-2">
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Presenter</dt><dd className="truncate">{flow.actorName ?? "Chosen for you"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Length</dt><dd className="tabular-nums">{flow.length} sec</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Format</dt><dd>Vertical 9:16</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Videos left</dt><dd className="tabular-nums">{user ? Math.max(0, user.minutesLimit - user.minutesUsed) : "…"}</dd></div>
              </dl>
            </div>
            <blockquote className="rounded-2xl border border-border bg-[oklch(0.2_0.07_295/0.5)] p-5 text-sm">
              <p className="line-clamp-5 italic text-foreground/90">&ldquo;{flow.reviewText}&rdquo;</p>
              <footer className="mt-2 text-xs text-muted-foreground">{flow.reviewerName} · {flow.businessName}</footer>
            </blockquote>
          </aside>
        ) : null}
      </div>
      {ready ? (
        <>
          <LaunchUpsell user={user} placement="video_ready" />
          <PriceSurvey placement="first_video_ready" trigger="now" />
        </>
      ) : null}
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<div className="min-h-[50vh]" />}>
      <GenerateContent />
    </Suspense>
  );
}
