import { prisma } from "@/lib/prisma";
import { forwardAdsEventToMeta } from "@/lib/ads/meta-forward";
import { founderAlert } from "@/lib/ads/founder-alert";

export type AdsEventName =
  | "signed_up"
  | "trial_started"
  | "extraction_shown"
  | "extraction_retried"
  | "run_confirmed"
  | "first_ad_ready"
  | "run_completed"
  | "export_downloaded"
  | "checkout_started"
  | "paid_converted"
  | "churned"
  | "upsell_shown"
  | "upsell_accepted"
  | "upsell_declined"
  | "downsell_shown"
  | "downsell_accepted"
  | "renewed"
  | "visit_landed"
  | "visit_engaged"
  | "trial_domain_blocked"
  | "trial_blocked"
  | "purchased"
  // Offer placements (props.placement: early_offer = buyable Launch Quarter under the first ready ads | early_ready (legacy preview) | trial_done | post_download | locked_bonus | unlock_pack)
  | "offer_nudge_shown"
  | "offer_modal_shown"
  | "offer_dismissed"
  | "offer_clicked"
  | "locked_bonus_shown"
  | "locked_asset_refused"
  // engine: trial bonus ads finished after the run completed
  | "bonus_ready"
  // Partner program + Ad of the week (admin_* = admin actions, props.actorId)
  | "partner_applied"
  | "admin_partner_approved"
  | "admin_partner_rejected"
  | "admin_partner_paid"
  | "feature_consented"
  | "feature_withdrawn"
  | "admin_feature_shortlisted"
  | "admin_feature_featured"
  | "admin_feature_declined"
  | "admin_outreach_gift"
  // Give 10, get 10 (referrals) + gift packs. gift_ready / referral rewards are emitted by the engine.
  | "referral_landed"
  | "referral_signed_up"
  | "referral_free_month_claimed"
  | "gift_created"
  | "gift_viewed"
  | "gift_shared"
  | "gift_claimed"
  | "gift_ready"
  // Ozzy Studio funnel (studio_render_delivered + studio_first_render are emitted by the engine)
  | "studio_session_started"
  | "studio_free_blocked"
  | "studio_message_sent"
  | "studio_upload"
  | "studio_render_delivered"
  | "studio_first_render"
  | "studio_paywall_shown"
  | "studio_offer_viewed"
  | "studio_checkout_started"
  | "studio_share_created"
  | "studio_share_viewed"
  | "studio_invite_sent"
  | "studio_invite_claimed"
  | "studio_invite_rewarded"
  // Ads trial -> Studio bridge (flag studio_bridge): props.placement, clicked also adKind
  | "studio_bridge_shown"
  | "studio_bridge_clicked";

/** Fire-and-forget funnel event. Never throws. */
export async function trackAdsEvent(
  name: AdsEventName,
  data: { workspaceId?: string; userId?: string; runId?: string; props?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    // Meta CAPI for funnel steps (fire-and-forget, never throws); adds the attribution it used to props.
    const meta = await forwardAdsEventToMeta(name, data);
    const props = meta ? { ...(data.props ?? {}), meta } : data.props;
    await prisma.adsEvent.create({
      data: { name, workspaceId: data.workspaceId, userId: data.userId, runId: data.runId, props: (props ?? {}) as object },
    });
    await founderAlert(name, data);
  } catch {
    // analytics must never break the product
  }
}
