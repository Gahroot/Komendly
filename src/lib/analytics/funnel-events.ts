// The Komendly Ads funnel, as GA4 events. Recommended GA4 names where they exist (sign_up, login, begin_checkout, purchase).

export type FunnelEvent =
  | "landing_view" // homepage rendered
  | "demo_video_view" // /free-ads demo film scrolled into view (A/B free_ads_demo)
  | "demo_video_sound" // visitor turned the demo sound on
  | "url_focus" // first focus of the URL field
  | "url_submit" // valid URL submitted (signed in or not)
  | "url_invalid" // submit blocked by validation
  | "goal_select"
  | "signup_view"
  | "sign_up"
  | "login"
  | "run_started"
  | "run_start_failed"
  | "extraction_review_shown"
  | "run_confirmed"
  | "first_ad_ready" // first successful ad of a run
  | "run_completed"
  | "run_failed"
  | "ad_downloaded"
  | "launch_guide_opened"
  | "upsell_view"
  | "trial_domain_blocked"
  | "upsell_accepted"
  | "upsell_declined"
  | "downsell_view"
  | "downsell_accepted"
  | "begin_checkout"
  | "purchase"
  // Testimonials funnel (params carry product: "testimonials")
  | "review_focus" // first focus of the landing review field
  | "review_submit" // valid review saved as a draft (no signup yet)
  | "offer_view" // first-video offer shown
  | "video_started" // generation started from the real start API
  | "video_ready" // final video reported by the status API
  | "video_failed";

/** Primary funnel, in order. Used for GA4 funnel exploration docs and tests. */
export const PRIMARY_FUNNEL: readonly FunnelEvent[] = ["landing_view", "url_submit", "sign_up", "run_started", "first_ad_ready", "begin_checkout", "purchase"];

/** Testimonials funnel, in order (all events carry product: "testimonials"). */
export const TESTIMONIALS_FUNNEL: readonly FunnelEvent[] = ["landing_view", "review_submit", "signup_view", "sign_up", "begin_checkout", "purchase", "video_started", "video_ready"];
