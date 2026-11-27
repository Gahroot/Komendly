// Shared Google Ads types (framework-free: no next/prisma/node-only imports; the engine imports this folder).

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export const GOOGLE_ADS_DEFAULT_VERSION = "v26"; // latest major on 2026-11-27 (sunset Nov 2027)

export type CampaignKind = "search" | "demand_gen";
export const CAMPAIGN_KINDS: readonly CampaignKind[] = ["search", "demand_gen"];

export type GeoPick =
  | { kind: "location"; id: string; name: string; type: string; countryCode: string }
  | { kind: "radius"; lat: number; lng: number; miles: number; label: string };

export interface KeywordPick { text: string; match: "PHRASE" | "EXACT" }

export interface SearchCopy { headlines: string[]; descriptions: string[]; path1: string; path2: string }

/** Responsive Search Ad + keyword limits (display width, see text.ts). */
export const LIMITS = {
  headline: 30,
  description: 90,
  path: 15,
  headlinesMin: 3,
  headlinesMax: 15,
  descriptionsMin: 2,
  descriptionsMax: 4,
  keywordChars: 80,
  keywordWords: 10,
  keywordsMax: 50,
  businessName: 25,
  demandGenHeadlinesMax: 5,
  demandGenDescriptionsMax: 5,
  demandGenLongHeadline: 90,
  demandGenImagesMax: 20,
  geoMax: 20,
  radiusMilesMax: 500,
} as const;

export type Serving = "paused" | "enabled" | "removed" | "unknown";
export type Policy = "approved" | "under_review" | "disapproved" | "limited" | "unknown";

export interface Readiness {
  billing: "ok" | "missing" | "unknown";
  account: "ok" | "suspended" | "canceled" | "unknown";
  managerLink: "none" | "pending" | "active" | "rejected";
  canPublish: boolean;
  blockers: string[];
}

export interface PickableAccount {
  customerId: string;
  name: string;
  currency: string;
  timeZone: string;
  manager: boolean;
  status: string;
  test: boolean;
  loginCustomerId?: string;
}

/** What we keep (encrypted) for an oauth connection. */
export interface StoredGoogleToken { refreshToken: string; scope?: string }

export class GoogleAdsApiError extends Error {
  constructor(message: string, public status?: number, public codes: string[] = [], public requestId?: string) {
    super(message);
    this.name = "GoogleAdsApiError";
  }
}

/** "123-456-7890" / "1234567890" -> "1234567890"; null when it isn't 10 digits. */
export function normalizeCustomerId(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").replace(/[\s-]/g, "");
  return /^\d{10}$/.test(d) ? d : null;
}

export function formatCustomerId(id: string): string {
  return id.length === 10 ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}` : id;
}

/** Last path segment of a resource name ("customers/1/campaigns/22" -> "22"). */
export function idOf(resourceName: string | null | undefined): string | null {
  if (!resourceName) return null;
  const last = resourceName.split("/").pop() ?? "";
  return last.split("~").pop() || null;
}
