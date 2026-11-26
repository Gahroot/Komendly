// Signal sources that cannot be implemented cleanly today. The detector interface exists so the pipeline, reports and
// the growth dashboard can list them as "awaiting_prerequisite" with the exact reason, instead of silently missing.
export interface GatedSource {
  id: string;
  status: "awaiting_prerequisite";
  reason: string;
  /** What would unblock it. */
  prerequisite: string;
  evidence: string[];
  detect(): Promise<never[]>;
}

const gated = (g: Omit<GatedSource, "status" | "detect">): GatedSource => ({ ...g, status: "awaiting_prerequisite", detect: async () => [] });

export const GATED_SOURCES: readonly GatedSource[] = [
  gated({
    id: "google_ads_transparency",
    reason: "Google Ads Transparency Center is a JavaScript app with no public API or bulk export; the Google Terms of Service prohibit automated access to the site, so scraping it is not lawful for us.",
    prerequisite: "A licensed data provider (e.g. SerpApi / DataForSEO Google Ads Transparency endpoints) or Google BigQuery public dataset 'bigquery-public-data.google_ads_transparency_center' (political ads only; no commercial advertisers).",
    evidence: ["https://adstransparency.google.com/ (client-rendered, no documented API)", "https://policies.google.com/terms (automated access clause)"],
  }),
  gated({
    id: "kickstarter_indiegogo",
    reason: "Kickstarter and Indiegogo have no public listing API; their Terms prohibit scraping, and Kickstarter's /discover JSON is bot-protected. Creators are also individuals, not local businesses with an own-site public email we may lawfully contact.",
    prerequisite: "Kickstarter's official RSS/newsletter feeds per category as a manual lead list, or a licensed provider such as Kicktraq / Webrobots (Kickstarter dataset, CC-licensed monthly dumps, https://webrobots.io/kickstarter-datasets/) joined to the creator's own site.",
    evidence: ["https://www.kickstarter.com/terms-of-use", "https://www.indiegogo.com/about/terms"],
  }),
  gated({
    id: "google_business_new_listing",
    reason: "No free source in this repo carries a listing creation date (Overture/FSQ/OSM do not); the Google Places API is paid and its terms bar storing results for prospecting.",
    prerequisite: "A paid/licensed dataset with first-seen dates, or a free dated feed (state business-registration open data, see src/gov.ts).",
    evidence: ["kly/src/gov.ts open-data feeds carry no registration date (see src/new-business.ts header)"],
  }),
];
