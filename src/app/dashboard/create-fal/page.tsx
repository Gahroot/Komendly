"use client";

import { Suspense, useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CreateSteps, StepTitle } from "@/components/testimonials/create/create-steps";
import { OzzyPerch, type OzzyMood } from "@/components/testimonials/ozzy-perch";
import { loadFlow, saveFlow } from "@/lib/create-flow";
import { loadDraft, REVIEW_MAX, REVIEW_MIN, type DraftLength, type PresenterGender } from "@/lib/testimonial-draft";
import { cn } from "@/lib/utils";

const MOODS = {
  idle: { form: "classic", expression: "happy", motion: "wave" },
  draft: { form: "joyful", expression: "happy", motion: "nod", line: "Your review's here. Check it over." },
  valid: { form: "joyful", expression: "happy", motion: "hop" },
  short: { form: "classic", expression: "confused", motion: "think", line: "A bit more of the review, please." },
  error: { form: "classic", expression: "confused", motion: "think", line: "That didn't save. Try again?" },
} satisfies Record<string, OzzyMood>;

function ReviewStep() {
  const router = useRouter();
  const params = useSearchParams();
  const ids = { review: useId(), business: useId(), reviewer: useId() };
  const [reviewText, setReviewText] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [rating, setRating] = useState(5);
  const [gender, setGender] = useState<PresenterGender>("any");
  const [length, setLength] = useState<DraftLength>("30");
  const [actorId, setActorId] = useState<string | undefined>();
  const [mood, setMood] = useState<keyof typeof MOODS>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Prefer the paste-your-review draft (from the landing page), then this tab's in-progress flow.
    const draft = loadDraft();
    const flow = loadFlow();
    const src = draft && (params.get("from") === "draft" || !flow) ? draft : flow;
    if (!src) return;
    setReviewText(src.reviewText);
    setBusinessName(src.businessName === "My business" ? "" : src.businessName);
    setReviewerName(src.reviewerName === "A happy customer" ? "" : src.reviewerName);
    setRating(src.rating);
    setGender(src.gender);
    setLength(src.length);
    setActorId(src.actorId);
    setMood("draft");
  }, [params]);

  const valid = reviewText.trim().length >= REVIEW_MIN;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError(`Paste at least ${REVIEW_MIN} characters of the review.`);
      setMood("short");
      return;
    }
    setSaving(true);
    setError(null);
    const review = {
      reviewText: reviewText.trim(),
      businessName: businessName.trim() || "My business",
      reviewerName: reviewerName.trim() || "A happy customer",
      rating,
    };
    const prev = loadFlow();
    const same = prev && prev.reviewText === review.reviewText && prev.businessName === review.businessName && prev.reviewerName === review.reviewerName && prev.rating === rating;
    try {
      let reviewId = same ? prev.reviewId : "";
      if (!reviewId) {
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...review, source: "manual" }),
        });
        const data = (await res.json().catch(() => ({}))) as { review?: { id: string }; error?: string };
        if (!res.ok || !data.review) throw new Error(data.error || "Couldn't save the review");
        reviewId = data.review.id;
      }
      saveFlow({ ...review, reviewId, gender, length, actorId: same ? (prev.actorId ?? actorId) : actorId, actorName: same ? prev.actorName : undefined });
      router.push("/dashboard/create-fal/style");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the review");
      setMood("error");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <CreateSteps current={1} />
      <StepTitle kicker="Step 1 of 3" title="The review">
        Paste what a customer wrote. We turn it into a short script, word for word in spirit.
      </StepTitle>

      <form onSubmit={onSubmit} noValidate className="relative pt-16">
        <OzzyPerch mood={MOODS[mood]} size={80} className="absolute right-3 top-0 z-10 sm:right-6" lineSide="left" />
        <div className="spellbar space-y-4 rounded-2xl p-4 sm:p-6" data-state={error ? "invalid" : valid ? "valid" : undefined}>
          <div className="space-y-2">
            <label htmlFor={ids.review} className="block text-sm font-medium">Customer review</label>
            <textarea
              id={ids.review}
              value={reviewText}
              onChange={(e) => {
                setReviewText(e.target.value);
                setError(null);
                if (e.target.value.trim().length >= REVIEW_MIN) setMood("valid");
              }}
              maxLength={REVIEW_MAX}
              rows={6}
              placeholder="“Booked a last-minute repair and they had us sorted in an hour…”"
              aria-invalid={!!error}
              className="w-full resize-y rounded-xl border border-border bg-[oklch(0.12_0.05_290/0.6)] p-3 text-base leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            />
            <p className="text-right text-xs tabular-nums text-muted-foreground">{reviewText.trim().length}/{REVIEW_MAX}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor={ids.business} className="block text-sm font-medium">Business name</label>
              <Input id={ids.business} value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={200} placeholder="Harbour Plumbing" className="h-11" />
            </div>
            <div className="space-y-2">
              <label htmlFor={ids.reviewer} className="block text-sm font-medium">Reviewer name <span className="text-muted-foreground">(optional)</span></label>
              <Input id={ids.reviewer} value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} maxLength={100} placeholder="Sam K." className="h-11" />
            </div>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Rating</legend>
            <div className="flex gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className="flex size-10 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--studio-gold)]">
                  <Star aria-hidden className={cn("size-6", n <= rating ? "fill-[var(--studio-gold)] text-[var(--studio-gold)]" : "text-muted-foreground")} />
                </button>
              ))}
            </div>
          </fieldset>
          {error ? <p role="alert" className="text-sm text-[oklch(0.86_0.1_25)]">{error}</p> : null}
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="spellbar__cta inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-6 font-semibold disabled:opacity-70 sm:w-auto">
              {saving ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
              Choose a presenter
              <ArrowRight aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function CreateFalVideoPage() {
  return (
    <Suspense fallback={<div className="min-h-[50vh]" />}>
      <ReviewStep />
    </Suspense>
  );
}
