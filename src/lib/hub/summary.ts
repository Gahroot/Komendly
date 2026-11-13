// Unified hub (/dashboard) view model. Pure: no I/O, no clock reads (pass `now`). Loader: load-summary.ts.
import { isStudioLaunchOfferOpen, STUDIO_LAUNCH_OFFER } from "./money-model";

export const HUB_APPS = ["ads", "studio", "testimonials"] as const;
export type HubApp = (typeof HUB_APPS)[number];

export const HUB_APP_LABEL: Record<HubApp, string> = { ads: "Ad Packs", studio: "Ozzy Studio", testimonials: "Testimonials" };

export function parseHubApp(v: string | null | undefined): HubApp | null {
  return (HUB_APPS as readonly string[]).includes(v ?? "") ? (v as HubApp) : null;
}

/** One thing the user made, in any app. */
export interface HubItem {
  id: string;
  app: HubApp;
  title: string;
  /** "image" | "video"; thumbUrl may be null while it is still being made. */
  media: "image" | "video";
  thumbUrl: string | null;
  href: string;
  status: "ready" | "working" | "failed";
  createdAt: string;
}

/** Newest first, id asc on ties (deterministic). */
export function mergeRecent(items: readonly HubItem[], limit: number): HubItem[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).slice(0, Math.max(0, limit));
}

const LEGACY_PLANS = new Set(["starter", "pro", "enterprise"]);
const ACTIVE = new Set(["active", "trialing", "past_due"]);
const PAID_WS = new Set(["active", "trialing", "past_due"]);

export interface HubUserInput {
  plan: string;
  subscriptionStatus: string;
  minutesLimit: number;
  minutesUsed: number;
  bonusMinutes: number;
  isAdmin?: boolean;
}

export interface HubWorkspaceInput {
  adsPlan: string;
  subscriptionStatus: string;
  creditBalance: number;
  studioFreeVideos: number;
  studioOfferReadyAt: Date | null;
  suspendedAt?: Date | null;
}

/** Existing testimonial subscriber on the old starter/pro/enterprise Stripe plan (grandfathered). */
export function isLegacyTestimonialPlan(u: Pick<HubUserInput, "plan" | "subscriptionStatus">): boolean {
  return LEGACY_PLANS.has(u.plan) && ACTIVE.has(u.subscriptionStatus);
}

export function isPaidOzzyPlan(w: Pick<HubWorkspaceInput, "adsPlan" | "subscriptionStatus" | "suspendedAt">): boolean {
  return w.adsPlan !== "trial" && PAID_WS.has(w.subscriptionStatus) && !w.suspendedAt;
}

export function testimonialVideosLeft(u: Pick<HubUserInput, "minutesLimit" | "minutesUsed">): number {
  return Math.max(0, u.minutesLimit - u.minutesUsed);
}

/** Can the user open the testimonial create flow? Subscribers, pack buyers, plans that include testimonials, admins. */
export function canMakeTestimonials(u: HubUserInput): boolean {
  if (u.isAdmin) return true;
  return isLegacyTestimonialPlan(u) || u.bonusMinutes > 0 || testimonialVideosLeft(u) > 0;
}

export interface HubWallet {
  credits: number;
  freeStudioVideos: number;
  /** null = hide (no testimonial plan and none left). */
  testimonialVideos: number | null;
}

export function walletView(u: HubUserInput, w: HubWorkspaceInput): HubWallet {
  const left = testimonialVideosLeft(u);
  return {
    credits: Math.max(0, w.creditBalance),
    freeStudioVideos: Math.max(0, w.studioFreeVideos),
    testimonialVideos: left > 0 || isLegacyTestimonialPlan(u) ? left : null,
  };
}

export type HubPlanKind = "free" | "studio_offer" | "legacy" | "paid";

export interface HubPlan {
  kind: HubPlanKind;
  label: string;
  line: string;
  cta: { label: string; href: string };
  /** Studio launch offer deadline (ISO) when kind = studio_offer. */
  offerEndsAt: string | null;
}

const PLAN_NAMES: Record<string, string> = { starter: "Starter", ad_department: "Ad Department", growth: "Growth", scale: "Scale", agency: "Agency" };

/** Which plan card + upgrade CTA the hub shows. Paid Ozzy plan wins over a legacy testimonial plan. */
export function planView(u: HubUserInput, w: HubWorkspaceInput, now: Date): HubPlan {
  if (isPaidOzzyPlan(w) && w.adsPlan === "ad_department") {
    return {
      kind: "paid",
      label: "Ozzy Ad Department",
      line: "Fresh ads land every Monday. Unlimited Ad Packs and Studio videos, made one at a time. Ad Coach is ready when you have results.",
      cta: { label: "Post your ads on Meta", href: "/ads/billing#launch-guide" },
      offerEndsAt: null,
    };
  }
  if (isPaidOzzyPlan(w)) {
    return {
      kind: "paid",
      label: `Ozzy ${PLAN_NAMES[w.adsPlan] ?? w.adsPlan}`,
      line: `${w.creditBalance} credits left this month. Top up any time; they work in Ad Packs and Ozzy Studio.`,
      cta: { label: "Top up credits", href: "/ads/billing#topups" },
      offerEndsAt: null,
    };
  }
  if (isLegacyTestimonialPlan(u)) {
    return {
      kind: "legacy",
      label: "Legacy testimonials plan",
      line: "You keep your plan and price. Switch to an Ozzy plan to unlock Studio and Ad Packs credits too.",
      cta: { label: "See the switch offer", href: "/dashboard/billing" },
      offerEndsAt: null,
    };
  }
  if (isStudioLaunchOfferOpen(w.studioOfferReadyAt, now) && w.studioOfferReadyAt) {
    const ends = new Date(w.studioOfferReadyAt.getTime() + STUDIO_LAUNCH_OFFER.windowHours * 3_600_000);
    return {
      kind: "studio_offer",
      label: "Free",
      line: `${STUDIO_LAUNCH_OFFER.headline}: your AI ad department, first month $97 instead of $197.`,
      cta: { label: "Claim the launch offer", href: `/ads/billing?offer=${STUDIO_LAUNCH_OFFER.key}` },
      offerEndsAt: ends.toISOString(),
    };
  }
  return {
    kind: "free",
    label: "Free",
    line: "Your AI ad department: fresh ads every Monday, a coach that tells you what's working, 30-day no-questions refund.",
    cta: { label: "See plans", href: "/ads/billing" },
    offerEndsAt: null,
  };
}

export interface HubCounts {
  ads: number;
  studio: number;
  testimonials: number;
}

export interface HubSummary {
  firstName: string;
  wallet: HubWallet;
  plan: HubPlan;
  counts: HubCounts;
  canMakeTestimonials: boolean;
  recent: HubItem[];
}

export function firstNameOf(u: { name: string | null; email: string }): string {
  const n = u.name?.trim().split(/\s+/)[0];
  return n || u.email.split("@")[0] || "there";
}

/** Ozzy's one-line greeting, picked from real state only. */
export function greetingLine(s: Pick<HubSummary, "counts" | "wallet" | "firstName">): string {
  const total = s.counts.ads + s.counts.studio + s.counts.testimonials;
  if (total === 0) {
    return s.wallet.freeStudioVideos > 0
      ? `G'day ${s.firstName}! Your first Studio video is on me. Tell me what to make.`
      : `G'day ${s.firstName}! Tell me what you want to make and I'll get cracking.`;
  }
  return `G'day ${s.firstName}, welcome back. What are we making today?`;
}
