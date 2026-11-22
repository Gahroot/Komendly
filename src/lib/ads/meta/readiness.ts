// Can this Meta ad account run ads? Pure (client-safe). Unknown fields never block: we only flag what Meta told us.
import type { MetaAdAccount, MetaPage } from "./core/types";

export const READINESS_CODES = ["no_ad_account", "disabled", "unpaid", "in_review", "closed", "no_payment", "no_page"] as const;
export type ReadinessCode = (typeof READINESS_CODES)[number];

export interface ReadinessIssue { code: ReadinessCode; text: string; fixLabel: string; fixUrl: string }
export interface Readiness { ok: boolean; issues: ReadinessIssue[] }

const numericId = (id: string) => id.replace(/^act_/, "");

export const META_LINKS = {
  createAdAccount: "https://adsmanager.facebook.com/adsmanager/",
  businessAdAccounts: "https://business.facebook.com/settings/ad-accounts",
  accountQuality: "https://www.facebook.com/business-support-home/",
  createPage: "https://www.facebook.com/pages/create",
  billing: (accountId: string) => `https://adsmanager.facebook.com/billing_hub/payment_settings?asset_id=${encodeURIComponent(numericId(accountId))}`,
} as const;

/** Shown when someone has no Meta ad account at all. */
export const NO_AD_ACCOUNT_HELP = {
  title: "No Meta ads account yet?",
  text: "Open Meta Ads Manager once with your Facebook login. Meta creates an ads account for you. Add a payment method there, then come back and click Check again.",
  url: META_LINKS.createAdAccount,
} as const;

function statusIssue(account: MetaAdAccount): ReadinessIssue | null {
  switch (account.status) {
    case 2:
      return { code: "disabled", text: "Meta has turned off this ads account. You can ask Meta to review it.", fixLabel: "Ask Meta to review", fixUrl: META_LINKS.accountQuality };
    case 3: case 8: case 9:
      return { code: "unpaid", text: "This ads account has an unpaid balance. Pay it, then ads can run again.", fixLabel: "Pay balance", fixUrl: META_LINKS.billing(account.id) };
    case 7:
      return { code: "in_review", text: "Meta is still reviewing this ads account. This usually takes a day. Try again later.", fixLabel: "See account status", fixUrl: META_LINKS.accountQuality };
    case 100: case 101:
      return { code: "closed", text: "This ads account is closed. Pick another account or open a new one.", fixLabel: "Manage ads accounts", fixUrl: META_LINKS.businessAdAccounts };
    default:
      return null;
  }
}

export function accountReadiness(account: MetaAdAccount | null | undefined, pages: readonly MetaPage[] | null | undefined): Readiness {
  const issues: ReadinessIssue[] = [];
  if (!account) {
    issues.push({ code: "no_ad_account", text: "You don't have a Meta ads account yet.", fixLabel: "Create one in Ads Manager", fixUrl: META_LINKS.createAdAccount });
  } else {
    const s = statusIssue(account);
    if (s) issues.push(s);
    // An unpaid/closed account already points to billing or elsewhere; don't stack a second payment issue.
    if (account.hasPayment === false && (!s || s.code === "in_review")) {
      issues.push({ code: "no_payment", text: "Add a payment method so Meta can charge for your ads.", fixLabel: "Add payment method", fixUrl: META_LINKS.billing(account.id) });
    }
  }
  if (pages && pages.length === 0) {
    issues.push({ code: "no_page", text: "Ads run from a Facebook Page. Create one for your business (it takes 2 minutes).", fixLabel: "Create a Page", fixUrl: META_LINKS.createPage });
  }
  return { ok: issues.length === 0, issues };
}
