// Pure plan for erasing/anonymising one user's personal data. scripts/privacy-purge-user.ts executes it (dry-run by default).
// Financial records (CreditPurchase, CreditLedger, AdsRefund) are RETAINED for tax/dispute reasons and only lose the link by way
// of the anonymised User row. Not legal advice.
import { createHash } from "node:crypto";

export type PurgeAction = "delete" | "anonymise" | "scrub_events" | "suppress";
export interface PurgeStep { id: string; model: string; action: PurgeAction; where: Record<string, unknown>; set?: Record<string, unknown>; note: string; optIn?: "delete-content" }
export interface PurgeSubject { userId: string; email: string; workspaceIds: string[] }

export const RETAINED = ["CreditPurchase", "CreditLedger", "AdsRefund", "AdsTrialClaim (hashed IP/identity, abuse prevention)"] as const;

export function anonEmail(email: string, userId: string): string {
  return `deleted-${createHash("sha256").update(`${userId}:${email.toLowerCase()}`).digest("hex").slice(0, 16)}@deleted.invalid`;
}

/** Every table that references the subject, with what happens to it. Order matters: sessions and keys go first. */
export function buildPurgePlan(s: PurgeSubject): PurgeStep[] {
  const email = s.email.toLowerCase();
  const u = { userId: s.userId };
  const anon = anonEmail(email, s.userId);
  return [
    { id: "sessions", model: "Session", action: "delete", where: u, note: "log the user out everywhere" },
    { id: "agent_keys", model: "AgentApiKey", action: "delete", where: u, note: "kmd_ keys" },
    { id: "oauth_grants", model: "OAuthGrant", action: "delete", where: u, note: "MCP/ChatGPT grants" },
    { id: "oauth_codes", model: "OAuthAuthCode", action: "delete", where: u, note: "" },
    { id: "api_keys", model: "ApiKey", action: "delete", where: u, note: "testimonials API keys" },
    { id: "webhooks", model: "Webhook", action: "delete", where: u, note: "customer webhook URLs" },
    { id: "verify_tokens", model: "EmailVerificationToken", action: "delete", where: u, note: "" },
    { id: "meta_state", model: "MetaOAuthState", action: "delete", where: u, note: "" },
    { id: "outbound_leads", model: "OutboundLead", action: "anonymise", where: { email }, set: { email: anon }, note: "cold-email lead row for this address" },
    { id: "outbound_leads_user", model: "OutboundLead", action: "anonymise", where: u, set: { userId: null }, note: "unlink converted lead" },
    { id: "outbound_sends", model: "OutboundSend", action: "anonymise", where: { toEmail: email }, set: { toEmail: anon }, note: "send log keeps counts, loses the address" },
    { id: "kly_places", model: "KlyPlace", action: "anonymise", where: { email }, set: { email: null }, note: "scraped business contact" },
    { id: "voice_events", model: "OutboundVoiceEvent", action: "anonymise", where: { email }, set: { email: anon }, note: "" },
    { id: "studio_invites", model: "StudioInvite", action: "anonymise", where: { email }, set: { email: anon }, note: "referral invites sent to this address" },
    { id: "meta_leads", model: "MetaLead", action: "anonymise", where: { email }, set: { email: null }, note: "leads captured for this address (customer-owned data: confirm with the customer)" },
    { id: "shopify", model: "ShopifyShop", action: "anonymise", where: u, set: { email: null }, note: "shop contact email" },
    { id: "events_by_user", model: "AdsEvent", action: "scrub_events", where: u, note: "remove email/name/to/ip keys from props where userId matches" },
    { id: "events_by_email", model: "AdsEvent", action: "scrub_events", where: { propsContainsEmail: email }, note: "events (e.g. signup, lifecycle) that carry the address in props" },
    { id: "suppress", model: "OutboundSuppression", action: "suppress", where: { value: email }, set: { kind: "email", reason: "manual" }, note: "never email this address again from any sender" },
    { id: "user", model: "User", action: "anonymise", where: { id: s.userId }, set: { email: anon, name: null, isAdmin: false }, note: "row kept (billing FKs); password hash is replaced with random data by the script" },
    { id: "content", model: "GeneratedVideo", action: "delete", where: u, note: "customer videos (testimonials)", optIn: "delete-content" },
    { id: "content_fal", model: "FalCompositeVideo", action: "delete", where: u, note: "customer videos (testimonials)", optIn: "delete-content" },
    { id: "content_reviews", model: "Review", action: "delete", where: u, note: "customer reviews/testimonial text", optIn: "delete-content" },
  ];
}

export const EVENT_PII_KEYS = ["email", "to", "name", "firstName", "ip", "phone", "toEmail", "leadEmail"] as const;
