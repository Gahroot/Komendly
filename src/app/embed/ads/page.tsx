import type { Metadata } from "next";
import { PUBLIC_OFFER } from "@/lib/ads/public-offer";
import { cleanPartnerTag, embedUtm } from "@/lib/growth/embed";

// Rendered inside partners' iframes. Plain GET form to /free-ads (new tab): no API calls, no cookies read, no PII.
export const metadata: Metadata = { title: "Make ads from your website", robots: { index: false, follow: false } };

export default async function EmbedAdsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const utm = embedUtm(cleanPartnerTag((await searchParams).p));
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", background: "#0c0820", color: "#f5f3ff", margin: 0, padding: 20, minHeight: "100vh", boxSizing: "border-box" }}>
      <form method="GET" action="/free-ads" target="_blank" rel="noopener" style={{ maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, margin: "0 0 6px" }}>Make ads from your website</h1>
        <p style={{ fontSize: 13, margin: "0 0 12px", opacity: 0.75 }}>Paste your site and get ready-to-run Facebook and Instagram ads. {PUBLIC_OFFER.freeAds} free, no card.</p>
        {Object.entries(utm).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <input name="url" type="text" inputMode="url" required placeholder="yourwebsite.com" aria-label="Your website" style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 8, border: "1px solid #4b3f7a", background: "#161033", color: "inherit", fontSize: 15 }} />
        <button type="submit" style={{ marginTop: 10, width: "100%", padding: "11px 12px", borderRadius: 8, border: 0, background: "#ffcf4a", color: "#2a0f10", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>Get my free ads</button>
        <p style={{ fontSize: 11, margin: "10px 0 0", opacity: 0.55 }}>Powered by Komendly. Opens in a new tab.</p>
      </form>
    </main>
  );
}
