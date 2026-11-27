// Pre-approved offer experiments (code defaults). Each swaps copy or ordering only: never prices, never new claims
// (tests lint every payload). Control = first variant, no payload = the copy that ships today. Hypotheses use the
// Hormozi value equation: Value = (Dream Outcome x Perceived Likelihood) / (Time Delay x Effort & Sacrifice).
// Max 2 running per surface (MAX_RUNNING_PER_SURFACE). Served only while AdsFeatureFlag sys_offer_intel is on.
import { EXPERIMENT_DEFAULTS, type ExperimentDef } from "../revenue/experiments";

export const OFFER_EXPERIMENTS: ExperimentDef[] = [
  {
    key: "home_headline_outcome_vs_free_first", surface: "home_hero", metric: "signed_up", minPerVariant: 300,
    hypothesis: "Dream outcome (customers asking for quotes) converts visitors to sign-up less than the lowest-effort, shortest-delay entry (see your ads free, in minutes): value equation, time delay and effort lever vs dream-outcome lever.",
    variants: [
      { id: "control", weight: 1 },
      { id: "free_first", weight: 1, payload: { headline: "See {freeAds} ads made from your website, free, in minutes", sub: "For local businesses: roofers, plumbers, HVAC, landscapers, cleaners, dentists. Paste your website and get ads made from your own logo and colors, no card. Like them? We run them on Facebook and Instagram and email you the leads." } },
    ],
  },
  {
    key: "free_ads_headline_effort", surface: "free_ads_hero", metric: "signed_up", minPerVariant: 300,
    hypothesis: "Cold Meta traffic is held back by perceived effort and sacrifice; a headline that names the tiny action (paste your website) beats one that names the big outcome.",
    variants: [
      { id: "control", weight: 1 },
      { id: "paste_site", weight: 1, payload: { headline: "Paste your website. Your {freeAds} free ads are ready in minutes. No card.", sub: "For local businesses. Made from your own logo and colors. Like them? We run them on Facebook and Instagram and email you the leads." } },
    ],
  },
  {
    key: "upsell_first_month_framing", surface: "unlock_upsell", metric: "offer_clicked", minPerVariant: 80,
    hypothesis: "Framing the small first yes as a bounded trial ('try it for 30 days') lowers perceived risk more than the plain 'first month' price line.",
    variants: [
      { id: "control", weight: 1 },
      { id: "try_30_days", weight: 1, payload: { firstMonth: "Try it for 30 days: {first}, then {monthly}/month" } },
    ],
  },
  {
    key: "upsell_lead_outcome_vs_effort", surface: "unlock_upsell", metric: "offer_clicked", minPerVariant: 80,
    hypothesis: "Right after a purchase, the buyer's effort worry (who sets this up?) is the objection; answering it in the title beats restating the task.",
    variants: [
      { id: "control", weight: 1 },
      { id: "we_do_it_with_you", weight: 1, payload: { title: "Want us to run these for you, set up together?", lead: "Your pack is unlocked. We connect Facebook with you, put the ads live and email you every lead." } },
    ],
  },
  {
    key: "offer_card_guarantee_placement", surface: "autopilot_card", metric: "checkout_started", minPerVariant: 80,
    hypothesis: "Risk reversal works best at the moment of the click: the guarantee line above the button beats the same line below it.",
    variants: [
      { id: "control", weight: 1 },
      { id: "guarantee_above", weight: 1, payload: { guaranteePlacement: "above_button" } },
    ],
  },
  {
    key: "offer_card_objection_order", surface: "autopilot_card", metric: "checkout_started", minPerVariant: 80,
    hypothesis: "Objection-stack order: leading with wasted money and generic ads (the trust objections) beats leading with 'can't run ads'.",
    variants: [
      { id: "control", weight: 1 },
      { id: "money_first", weight: 1, payload: { order: "money_first" } },
    ],
  },
];

/** Idempotent: append the offer experiments to the shared code defaults (DB exp_defined rows still override by key). */
export function registerOfferExperiments(): void {
  for (const d of OFFER_EXPERIMENTS) if (!EXPERIMENT_DEFAULTS.some((x) => x.key === d.key)) EXPERIMENT_DEFAULTS.push(d);
}
registerOfferExperiments();
