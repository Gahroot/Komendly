"use client";

import { useRouter } from "next/navigation";
import { loadDraft } from "@/lib/testimonial-draft";
import { FIRST_VIDEO_OFFER } from "@/lib/first-video-offer";
import { FirstVideoOfferCard } from "./first-video-offer-card";

/** Landing offer card: with a draft, go straight to the short signup; without, jump to the review form. */
export function OfferSectionCta() {
  const router = useRouter();
  function claim() {
    if (loadDraft()) {
      router.push("/register?flow=first_video");
      return;
    }
    const el = document.getElementById("start");
    el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    el?.querySelector("textarea")?.focus({ preventScroll: true });
  }
  return <FirstVideoOfferCard onClaim={claim} ctaLabel={`Get my ${FIRST_VIDEO_OFFER.name}`} />;
}
