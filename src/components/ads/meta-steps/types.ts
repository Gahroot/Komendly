import type { MetaStatus } from "@/lib/ads/meta/status-types";

export type MetaOkStatus = Extract<MetaStatus, { access: "ok" }>;
export const META_STEPS = ["connect", "account", "ads", "targeting", "review", "done"] as const;
export type MetaStep = (typeof META_STEPS)[number];
export const STEP_LABELS: Record<MetaStep, string> = {
  connect: "Connect", account: "Account", ads: "Ads", targeting: "Audience & budget", review: "Review", done: "Done",
};
