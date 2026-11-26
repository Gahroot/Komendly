import type { Metadata } from "next";
import { Faq, PageShell, RelatedLinks } from "@/components/resources/shell";
import { InspirationTool } from "@/components/resources/tools";
import { buildInspirationIndex } from "@/lib/growth/organic/inspiration";
import { INSPIRATION_PATH } from "@/lib/growth/organic/registry";
import { absoluteUrl } from "@/lib/site";
import { breadcrumbJsonLd, faqJsonLd, graph } from "@/lib/seo/jsonld";

export const revalidate = 3600;
const n = buildInspirationIndex().length;
const DESC = `Search ${n} hand-written ad hooks, headlines, offers, proof points and ad texts for local businesses. Filter by type and industry, then copy what fits. Free, no sign-up.`;
export const metadata: Metadata = { title: "Ad Inspiration Search for Local Business Ads", description: DESC, alternates: { canonical: INSPIRATION_PATH }, openGraph: { title: "Ad inspiration search", description: DESC, url: INSPIRATION_PATH } };
const FAQ = [{ q: "Where do these ideas come from?", a: "They are written by hand from our trade playbooks and copy library. They use [brackets] instead of real business names or invented results." }, { q: "Can I use them as they are?", a: "Treat them as starting points. Fill the brackets with your real details and offers, and only claim what is true for your business." }];

export default function Page() {
  return (
    <PageShell crumbs={[{ name: "Home", href: "/" }, { name: "Ad inspiration" }]} h1="Ad inspiration search" intro={`Search ${n} hooks, headlines, offers and proof lines across 50 local trades.`} campaign="ad-inspiration"
      jsonLd={graph(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Ad inspiration", path: INSPIRATION_PATH }]), faqJsonLd(FAQ, absoluteUrl(INSPIRATION_PATH)))}>
      <InspirationTool />
      <Faq items={FAQ} />
      <RelatedLinks items={[{ href: "/ad-copy-library", label: "Ad copy library" }, { href: "/ad-examples", label: "Ad examples by industry" }, { href: "/tools", label: "Free tools" }]} />
    </PageShell>
  );
}
