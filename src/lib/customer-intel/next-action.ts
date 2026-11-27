// "Next best action": one clear next step per customer state. Pure; no promises of results.

export interface CustomerState {
  paid: boolean;
  trialUsed?: boolean;
  /** Newest pack: its status ("extracting" | "awaiting_confirm" | "queued" | "generating" | "completed" | "partial" | "failed" ...). null = no pack yet. */
  runStatus?: string | null;
  readyAds?: number;
  downloaded?: boolean;
  /** Pack sent to a client and still waiting for a reply. */
  approvalPending?: boolean;
  changesRequested?: boolean;
  metaConnected?: boolean;
  adsLive?: boolean;
  credits?: number;
  /** Cost of a normal weekly drop, to tell "low" from "enough". */
  dropCost?: number;
  daysSinceLastPack?: number | null;
}

export interface NextAction { id: string; title: string; body: string; cta: string; href: string }

const A = (id: string, title: string, body: string, cta: string, href: string): NextAction => ({ id, title, body, cta, href });

/** Priority order matters: the first rule that fits wins, so there is exactly one step. */
export function nextBestAction(s: CustomerState): NextAction {
  const run = s.runStatus ?? null;
  if (!run) return A("make_first_pack", "Make your first ad pack", "Paste your website and Ozzy writes the ads from it. It takes about a minute to set up.", "Make my ads", "/ads/start");
  if (run === "failed") return A("retry_pack", "That pack didn't finish", "Nothing was lost. Try again with the same website; if it fails twice, write to us and we'll fix it.", "Try again", "/ads/start");
  if (["extracting", "awaiting_confirm", "queued", "generating"].includes(run)) {
    return run === "awaiting_confirm"
      ? A("confirm_pack", "Check your business details", "Make sure the offer and area are right, then confirm. Ozzy starts as soon as you do.", "Review and confirm", "/ads/app")
      : A("wait_pack", "Your ads are being made", "You can close this page. We'll show them here when they're ready.", "See progress", "/ads/app");
  }
  if (s.changesRequested) return A("apply_changes", "Your client asked for changes", "Read their note and ask Ozzy for a new version.", "See the note", "/ads/app");
  if (s.approvalPending) return A("await_approval", "Waiting for your client to approve", "They have the link. A gentle nudge usually does it.", "Open the pack", "/ads/app");
  if (!s.paid) {
    return s.downloaded
      ? A("unlock_more", "Want ads like these every week?", "Pick a plan and Ozzy makes a fresh set each Monday, ready for Meta.", "See plans", "/ads/pricing")
      : A("download_first", "Download the ads you like", "Pick your favourites and download them. They're yours to use.", "Choose my ads", "/ads/app");
  }
  if (!s.downloaded && (s.readyAds ?? 0) > 0 && !s.adsLive) return A("use_ads", "Pick the ads you'll use", "Download your favourites, or send them straight to Meta.", "Choose my ads", "/ads/app");
  if (!s.metaConnected) return A("connect_meta", "Connect Meta to put your ads live", "One secure connection and Ozzy can set them up for you to approve. You stay in control of spend.", "Connect Meta", "/ads/team");
  if (!s.adsLive) return A("go_live", "Choose your budget and go live", "Pick a daily budget you're comfortable with. You approve it before anything spends.", "Set it up", "/ads/team");
  if (s.dropCost != null && s.credits != null && s.credits < s.dropCost) return A("top_up", "You're low on credits for next week's ads", "Top up so the Monday drop isn't skipped.", "See credits", "/ads/billing");
  if ((s.daysSinceLastPack ?? 0) >= 7) return A("fresh_drop", "Time for fresh ads", "New angles keep the same audience from seeing the same ad again.", "Make this week's ads", "/ads/app");
  return A("review_results", "Check how your ads are doing", "See what Meta measured this week and which ads to keep.", "See results", "/ads/team");
}
