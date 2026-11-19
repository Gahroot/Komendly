import type { Metadata } from "next";
import Link from "next/link";
import { CtaButton } from "@/components/ad-examples/parts";
import { Cards, Faq, FinalCta, Hero, LINK, Prompts, Section, Shell, Steps } from "@/components/integrations/parts";
import { INTEGRATION_STATUS, statusLine } from "@/lib/integrations";
import { faqJsonLd, graph, jsonLdString } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site";

const TITLE = "AI ad creatives for your Shopify store";
const DESCRIPTION = "Shopify ad generator for Facebook and Instagram: Komendly reads your store and products and makes ready-to-run ad creatives. Free first pack; Shopify app in review.";
const STATUS = INTEGRATION_STATUS.shopify;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/integrations/shopify" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/integrations/shopify" },
};

const APP_DOES = [
  { title: "Reads your catalog, read-only", line: "The app asks for one permission, read_products. It pulls your shop name and description and your most recently updated active products: title, description, product type, starting price and featured image." },
  { title: "Whole store or one product", line: "Make a pack about your store as a whole, or pick a single product and get ads built around that product, its photo and its price." },
  { title: "Works before you launch", line: "Because it reads products through Shopify instead of the storefront, it works on password-protected stores, dev stores and shops that haven't opened yet." },
  { title: "Billed by Shopify", line: "Paid plans in the app are charged through your Shopify bill, and your first ad pack is free." },
];

const EXAMPLES = [
  "Whole store: a candle shop gets ads on its scent range, gifting angle and reviews pulled from its own site.",
  "One product: a bestselling linen shirt becomes feed and story ads using its product photo and starting price.",
  "Pre-launch: a password-protected store makes its launch ads before opening day, via the app.",
];

const FAQ = [
  { q: "Is there a Shopify app for Facebook ad creatives?", a: "Yes, Komendly: Ad Creatives. " + (STATUS.listed ? "You can install it from the Shopify App Store." : "It's in review for the Shopify App Store, so you can't install it from the store yet. The free ad pack on komendly.com makes the same ads from your store URL today.") },
  { q: "Does my myshopify.com store get its own free pack?", a: "Yes. Each myshopify.com subdomain counts as its own business, so your store gets its own free ad pack even if another shop on Shopify already used one." },
  { q: "My store is password-protected. Can I still try it?", a: "The website version needs a public storefront. Password-protected and dev stores are supported through the Shopify app, which reads products via Shopify instead of the website." },
  { q: "Does it run ads on Google or TikTok?", a: "No. Komendly makes and publishes ads for Meta only: Facebook and Instagram." },
  { q: "Will it change anything in my store?", a: "No. The app only has read access to products and never edits your store, theme or orders." },
];

const jsonLd = jsonLdString(graph(faqJsonLd(FAQ, `${SITE_URL}/integrations/shopify`)));

export default function ShopifyIntegration() {
  return (
    <Shell jsonLd={jsonLd}>
      <Hero
        kicker={STATUS.listed ? "Shopify app" : "Shopify app · in review"}
        title="AI ad creatives for your Shopify store"
        also="Also searched as: Shopify ad generator, Shopify Facebook ad creative app, Instagram ads for Shopify."
        intro={<p>Your product pages already have the photos, prices and words that sell. Komendly turns them into Facebook and Instagram ads that look like your brand. {statusLine("shopify")}</p>}
        cta={STATUS.listed && STATUS.directoryUrl ? <CtaButton href={STATUS.directoryUrl}>Install on Shopify</CtaButton> : <CtaButton href="/free-ads">Paste my store URL, free</CtaButton>}
      />
      <Section id="today-title" title="Get Shopify ads today">
        <Steps steps={[
          { title: "Copy your store address", body: <p>Your own domain or your <code className="font-mono">yourstore.myshopify.com</code> address both work.</p> },
          { title: "Paste it into the free ad pack", body: <p>Go to <Link href="/free-ads" className={LINK}>free ads</Link> and paste the URL. Komendly reads your storefront, products and reviews.</p> },
          { title: "Download and run them", body: <p>In a few minutes you get a pack of ready-to-post ads with headlines and ad copy. Download them, or publish to Facebook and Instagram from Komendly.</p> },
        ]} />
      </Section>
      <Section id="app-title" title="What the Komendly: Ad Creatives app does">
        <Cards items={APP_DOES} />
      </Section>
      <Section id="examples-title" title="What stores make with it">
        <Prompts prompts={EXAMPLES} />
        <p className="mt-6 text-sm text-muted-foreground">See finished ads by industry in <Link href="/ad-examples" className={LINK}>ad examples</Link>, or ask for Shopify ads from a chat with <Link href="/integrations/chatgpt" className={LINK}>ChatGPT</Link> or <Link href="/integrations/claude" className={LINK}>Claude</Link>.</p>
      </Section>
      <Faq items={FAQ} />
      <FinalCta title="Your products, as ads, in minutes." line="First pack free, no card." cta={<CtaButton href="/free-ads">Make my free ad pack</CtaButton>} />
    </Shell>
  );
}
