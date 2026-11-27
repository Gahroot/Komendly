/**
 * Google Ads publishing end-to-end (manager auth) against a real account, then cleanup.
 *
 * Run (real): set -a; . ./.env.local; set +a; npx tsx scripts/google-ads-e2e.ts
 *   needs GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_MANAGER_ID, GOOGLE_ADS_MANAGER_REFRESH_TOKEN,
 *   GOOGLE_ADS_E2E_CUSTOMER_ID (a client/test account linked under the manager); optional GOOGLE_ADS_API_VERSION,
 *   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_E2E_RUN_ID (a ready run in the DEV db; otherwise a built-in fixture).
 * Dry run (no Google calls, mocked REST): npx tsx scripts/google-ads-e2e.ts --dry
 *
 * Steps: list accounts -> readiness -> draft -> publish search + demand_gen PAUSED -> sync -> REMOVE everything created
 * (always, also on failure). Never point this at a customer account: it creates and removes real (paused) campaigns.
 */
import { GoogleAdsClient } from "../src/lib/ads/google/core/client";
import { draftKeywords, draftSearchCopy } from "../src/lib/ads/google/core/draft";
import { checkReadiness, googleAdsClient, listAccounts, type Env } from "../src/lib/ads/google/core/ops";
import { parseGooglePublishPayload, publishToGoogle, rollback, type GooglePublishStore, type KindResult } from "../src/lib/ads/google/core/publish";
import { syncCampaigns } from "../src/lib/ads/google/core/sync";
import { normalizeCustomerId } from "../src/lib/ads/google/core/types";

const DRY = process.argv.includes("--dry");

// 1x1 PNG is too small for Google; the real run needs real pixels, so the fixture logo/image come from sharp when present.
async function solidJpeg(w: number, h: number): Promise<Uint8Array> {
  const sharp = (await import("sharp")).default;
  return new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: "#1f6feb" } }).jpeg().toBuffer());
}

function dryFetch(): typeof fetch {
  let n = 0;
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : {};
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
    if (url.includes("oauth2.googleapis.com/token")) return ok({ access_token: "dry", expires_in: 3600 });
    if (url.endsWith("googleAds:mutate")) return ok({ mutateOperationResponses: (body.mutateOperations as object[]).map(() => ({ r: { resourceName: `customers/0000000000/campaigns/${++n}` } })) });
    const q = String(body.query ?? "");
    if (q.includes("customer_client")) return ok({ results: [{ customerClient: { clientCustomer: "customers/1234567890", descriptiveName: "Dry test", currencyCode: "USD", timeZone: "America/New_York", manager: false, status: "ENABLED", testAccount: true } }] });
    if (q.includes("billing_setup")) return ok({ results: [{ billingSetup: { status: "APPROVED" } }] });
    if (q.includes("customerClientLinks") || q.includes("customer_client_link")) return ok({ results: [{ customerClientLink: { status: "ACTIVE" } }] });
    if (q.includes("FROM customer ")) return ok({ results: [{ customer: { status: "ENABLED" } }] });
    return ok({ results: [] });
  }) as typeof fetch;
}

async function main() {
  const env: Env = DRY
    ? { GOOGLE_ADS_CLIENT_ID: "dry", GOOGLE_ADS_CLIENT_SECRET: "dry", GOOGLE_ADS_MANAGER_ID: "1112223333", GOOGLE_ADS_MANAGER_REFRESH_TOKEN: "dry", GOOGLE_ADS_E2E_CUSTOMER_ID: "1234567890" }
    : process.env;
  if (DRY) globalThis.fetch = dryFetch();
  for (const k of ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_MANAGER_ID", "GOOGLE_ADS_MANAGER_REFRESH_TOKEN", "GOOGLE_ADS_E2E_CUSTOMER_ID"]) {
    if (!env[k]) throw new Error(`${k} is not set (see header)`);
  }
  const cid = normalizeCustomerId(env.GOOGLE_ADS_E2E_CUSTOMER_ID)!;
  const auth = { kind: "manager" as const };

  const accounts = await listAccounts(auth, env);
  console.log(`accounts: ${accounts.length}`, accounts.slice(0, 5).map((a) => `${a.customerId} ${a.name} ${a.currency}${a.test ? " (test)" : ""}`));
  const acc = accounts.find((a) => a.customerId === cid);
  if (!acc) throw new Error(`E2E customer ${cid} is not under the manager`);
  console.log("readiness:", await checkReadiness(auth, cid, undefined, env));

  const run = { brandName: "Komendly E2E Roofing", landingPage: "https://www.komendly.com/", mainOffer: "Roof repair, gutter cleaning and roof inspections", location: "Austin, TX" };
  const ads = [{ id: "e2e-ad", eligible: true, headline: "Storm damage? Get a free roof check", body: "Local roofers who show up on time and explain every repair.", cta: "Book a check", ratios: ["1:1", "1.91:1"] }];
  const copy = draftSearchCopy(run, ads);
  const keywords = draftKeywords(run);
  console.log("draft:", copy, keywords.slice(0, 5));

  const client: GoogleAdsClient = googleAdsClient(auth, undefined, env);
  const results: Record<string, KindResult> = {};
  const square = await solidJpeg(1200, 1200);
  const wide = await solidJpeg(1200, 628);
  const logo = await solidJpeg(512, 512);
  const store: GooglePublishStore = {
    loadAds: async () => ads,
    image: async (adId, ratio) => ({ adId, ratio, bytes: ratio === "1:1" ? square : wide, mime: "image/jpeg" }),
    logo: async () => logo,
    setResult: async (k, r) => { results[k] = r; console.log(`result ${k}:`, r.status, r.campaignResource ?? "", r.error ?? ""); },
  };
  const payload = parseGooglePublishPayload({
    adIds: ["e2e-ad"], customerId: cid, campaigns: ["search", "demand_gen"], dailyBudget: 10,
    geo: [{ kind: "location", id: "1026201", name: "Austin", type: "City", countryCode: "US" }], keywords, search: copy, finalUrl: run.landingPage,
  });
  let failed = false;
  try {
    const summary = await publishToGoogle({ client, store, payload, businessName: run.brandName, currency: acc.currency || "USD", now: () => new Date() });
    console.log("publish:", summary);
    const camps = Object.values(results).map((r) => r.campaignResource).filter((x): x is string => !!x);
    if (camps.length) console.log("sync:", Object.fromEntries(await syncCampaigns(client, cid, camps, acc.currency || "USD", new Date().toISOString().slice(0, 10))));
    if (summary.failed.length) failed = true;
  } catch (e) {
    failed = true;
    console.error("e2e error:", e instanceof Error ? e.message : e);
  } finally {
    const created = Object.entries(results).filter(([, r]) => r.campaignResource).map(([kind, r]) => ({ kind: kind as "search" | "demand_gen", campaign: r.campaignResource!, budget: r.budgetResource ?? null, adGroup: r.adGroupResource ?? null, ads: r.adResources ?? [], name: r.campaignName ?? "" }));
    const ok = await rollback(client, cid, created);
    console.log(`cleanup: removed ${created.length} campaign(s)`, ok ? "ok" : "FAILED (remove 'Komendly ...' campaigns by hand)");
    if (!ok) failed = true;
  }
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
