"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useSpell } from "@/components/studio/studio-spell";
import { track } from "@/lib/analytics/track";
import { FIRST_VIDEO_OFFER, formatUsd, videosLabel } from "@/lib/first-video-offer";
import { loadDraft, saveDraft, REVIEW_MAX, REVIEW_MIN, type DraftLength, type PresenterGender } from "@/lib/testimonial-draft";
import { OzzyPerch, type OzzyMood } from "./ozzy-perch";

const GENDERS: { id: PresenterGender; label: string }[] = [
  { id: "any", label: "Best match" },
  { id: "female", label: "Woman" },
  { id: "male", label: "Man" },
];
const LENGTHS: { id: DraftLength; label: string }[] = [
  { id: "30", label: "30 sec" },
  { id: "60", label: "60 sec" },
];

const MOODS = {
  idle: { form: "classic", expression: "happy", motion: "wave" },
  focus: { form: "classic", expression: "focused", motion: "nod", line: "G'day! Paste a review a customer wrote." },
  valid: { form: "joyful", expression: "happy", motion: "hop", line: "Lovely words. Who should say them?" },
  short: { form: "classic", expression: "confused", motion: "think", line: "A bit more of the review, please." },
  sent: { form: "creator", expression: "excited", motion: "celebrate", line: "Beauty. Quick account, then we film." },
} satisfies Record<string, OzzyMood>;

/** "Paste your review" on the landing page: saves a draft locally, no signup, then hands off to /register. */
export function ReviewDraftForm() {
  const router = useRouter();
  const { setSpell } = useSpell();
  const ids = { review: useId(), business: useId(), hint: useId() };
  const [reviewText, setReviewText] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [gender, setGender] = useState<PresenterGender>("any");
  const [length, setLength] = useState<DraftLength>("30");
  const [mood, setMood] = useState<keyof typeof MOODS>("idle");
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);

  useEffect(() => {
    const d = loadDraft();
    if (!d) return;
    // Restore the saved draft after hydration (localStorage is client-only, so it can't seed SSR state).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReviewText(d.reviewText);
    setBusinessName(d.businessName === "My business" ? "" : d.businessName);
    setGender(d.gender);
    setLength(d.length);
  }, []);

  const valid = reviewText.trim().length >= REVIEW_MIN;

  function onReviewChange(v: string) {
    setReviewText(v);
    setError(null);
    const ok = v.trim().length >= REVIEW_MIN;
    setSpell(v ? (ok ? "valid" : "typing") : "idle");
    if (ok && mood !== "valid") setMood("valid");
  }

  function onFocus() {
    if (focused.current) return;
    focused.current = true;
    track("review_focus", { product: "testimonials" });
    if (!valid) setMood("focus");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError(`Paste at least ${REVIEW_MIN} characters of the review.`);
      setSpell("invalid");
      setMood("short");
      return;
    }
    saveDraft({ reviewText: reviewText.trim(), businessName: businessName.trim(), reviewerName: "", rating: 5, gender, length });
    track("review_submit", { product: "testimonials", length, gender, chars: reviewText.trim().length });
    setSpell("cast");
    setMood("sent");
    router.push("/register?flow=first_video");
  }

  return (
    <form onSubmit={onSubmit} className="relative" aria-labelledby="start-title" noValidate>
      <OzzyPerch mood={MOODS[mood]} size={84} className="absolute -top-[76px] right-2 z-10 sm:right-6" lineSide="left" />
      <div className="spellbar space-y-3 p-3 sm:p-4" data-state={error ? "invalid" : valid ? "valid" : undefined}>
        <h2 id="start-title" className="sr-only">Start your video</h2>
        <label htmlFor={ids.review} className="block px-1 text-sm font-medium text-foreground">Paste a customer review</label>
        <textarea
          id={ids.review}
          value={reviewText}
          onChange={(e) => onReviewChange(e.target.value)}
          onFocus={onFocus}
          maxLength={REVIEW_MAX}
          rows={4}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.hint}
          placeholder="“Booked on Monday, fixed by Tuesday. Honest prices and they explained everything…”"
          className="block w-full resize-y rounded-xl border border-input bg-[oklch(0.12_0.05_290/0.7)] px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        />
        <p id={ids.hint} className={error ? "px-1 text-sm text-[oklch(0.8_0.14_25)]" : "px-1 text-xs text-muted-foreground"}>
          {error ?? "From Google, Yelp, Trustpilot, an email: any written review works."}
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label htmlFor={ids.business} className="mb-1 block px-1 text-xs text-muted-foreground">Business name (optional)</label>
            <input
              id={ids.business}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              maxLength={120}
              autoComplete="organization"
              className="h-11 w-full rounded-xl border border-input bg-[oklch(0.12_0.05_290/0.7)] px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            />
          </div>
          <fieldset>
            <legend className="mb-1 px-1 text-xs text-muted-foreground">Length</legend>
            <div role="radiogroup" aria-label="Length" className="flex gap-1.5">
              {LENGTHS.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={length === l.id} onClick={() => setLength(l.id)} className="spell-chip h-11 rounded-xl px-3 text-sm">{l.label}</button>
              ))}
            </div>
          </fieldset>
        </div>
        <fieldset>
          <legend className="mb-1 px-1 text-xs text-muted-foreground">Who says it?</legend>
          <div role="radiogroup" aria-label="Presenter" className="flex flex-wrap gap-1.5">
            {GENDERS.map((g) => (
              <button key={g.id} type="button" role="radio" aria-checked={gender === g.id} onClick={() => setGender(g.id)} className="spell-chip h-10 rounded-full px-4 text-sm">{g.label}</button>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="spellbar__cta inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-6 text-base font-semibold">
          Make my video <ArrowRight aria-hidden className="size-5" />
        </button>
      </div>
      <p className="mt-3 px-1 text-center text-xs text-muted-foreground">
        No account needed to start · {FIRST_VIDEO_OFFER.name}: {videosLabel(FIRST_VIDEO_OFFER.minutes)} for {formatUsd(FIRST_VIDEO_OFFER.priceCents)} · looks real or it&apos;s free
      </p>
    </form>
  );
}
