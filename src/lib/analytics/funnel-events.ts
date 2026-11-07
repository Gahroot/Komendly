// The Komendly Ads funnel, as GA4 events. Recommended GA4 names where they exist (sign_up, login, begin_checkout, purchase).

export type FunnelEvent =
  | "landing_view" // homepage rendered
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
  | "upsell_view"
  | "begin_checkout"
  | "purchase";

/** Primary funnel, in order. Used for GA4 funnel exploration docs and tests. */
export const PRIMARY_FUNNEL: readonly FunnelEvent[] = ["landing_view", "url_submit", "sign_up", "run_started", "first_ad_ready", "begin_checkout", "purchase"];
