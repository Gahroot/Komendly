// A visitor's draft testimonial, kept in localStorage so they can paste a review before signing up.
// Flow: /testimonials (draft) -> /register -> Stripe checkout -> /checkout/success -> create flow resumes from the draft.

export const DRAFT_KEY = "kmd_testimonial_draft";
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const REVIEW_MIN = 20;
export const REVIEW_MAX = 2000;

export type PresenterGender = "any" | "female" | "male";
export type DraftLength = "30" | "60";

export interface TestimonialDraft {
  reviewText: string;
  businessName: string;
  reviewerName: string;
  rating: number;
  gender: PresenterGender;
  length: DraftLength;
  actorId?: string;
  savedAt: number;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Validate untrusted JSON from storage. Returns null when unusable or stale. */
export function parseDraft(raw: string | null, now: number): TestimonialDraft | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const reviewText = str(o.reviewText, REVIEW_MAX);
  const savedAt = typeof o.savedAt === "number" ? o.savedAt : 0;
  if (reviewText.length < REVIEW_MIN || now - savedAt > DRAFT_MAX_AGE_MS) return null;
  const rating = typeof o.rating === "number" && o.rating >= 1 && o.rating <= 5 ? Math.round(o.rating) : 5;
  const gender: PresenterGender = o.gender === "female" || o.gender === "male" ? o.gender : "any";
  const length: DraftLength = o.length === "60" ? "60" : "30";
  const actorId = str(o.actorId, 100) || undefined;
  return {
    reviewText,
    businessName: str(o.businessName, 120) || "My business",
    reviewerName: str(o.reviewerName, 80) || "A happy customer",
    rating,
    gender,
    length,
    actorId,
    savedAt,
  };
}

export function loadDraft(): TestimonialDraft | null {
  try {
    return parseDraft(window.localStorage.getItem(DRAFT_KEY), Date.now());
  } catch {
    return null;
  }
}

export function saveDraft(draft: Omit<TestimonialDraft, "savedAt">): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // storage blocked: the flow still works, the user just re-pastes after paying
  }
}

export function updateDraft(patch: Partial<Omit<TestimonialDraft, "savedAt">>): void {
  const current = loadDraft();
  if (current) saveDraft({ ...current, ...patch });
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}
