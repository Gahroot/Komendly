// Plain-language copy for /ads (shared by client components; no server imports).
import type { AdGoalValue, Awareness } from "./contracts";

export const AWARENESS_INFO: Record<Awareness, { label: string; explain: string }> = {
  unaware: { label: "Unaware", explain: "Doesn't know they have the problem yet. Lead with a story or surprising truth." },
  problem_aware: { label: "Problem aware", explain: "Feels the pain but doesn't know solutions exist. Name the pain in their words." },
  solution_aware: { label: "Solution aware", explain: "Knows solutions exist, not that yours is best. Show why your approach wins." },
  product_aware: { label: "Product aware", explain: "Knows you, isn't convinced. Answer objections with proof." },
  most_aware: { label: "Most aware", explain: "Ready to buy. Give them the offer and a reason to act now." },
};

export const GOAL_LABELS: Record<AdGoalValue, string> = {
  auto: "Let the agent decide",
  leads: "Leads",
  sales: "Sales",
  awareness: "Awareness",
  traffic: "Traffic",
  app_installs: "App installs",
};

export const TRIAL_REASON_MESSAGES: Record<string, string> = {
  email_unverified: "Confirm your email to unlock your free ads. We just sent you a link.",
  domain_used: "This website has already used its free trial. Pick a plan to keep generating ads for it.",
  device_used: "A free trial was already used on this device. Pick a plan to keep going.",
  ip_used: "A free trial was already used from this network. Pick a plan to keep going.",
  disposable_email: "Free trials need a permanent email address. Sign up with your work or personal email.",
  suspended: "This account is suspended. Contact support if you think this is a mistake.",
  blocked_url: "We can't make ads for this website.",
  trial_used: "You've used your free trial. Pick a plan to generate more ads.",
};
