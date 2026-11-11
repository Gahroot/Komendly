import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { ADS_PLANS, ADS_TOPUPS, LAUNCH_QUARTER } from "@/lib/ads/billing-config";
import { FIRST_VIDEO_OFFER, formatUsd } from "@/lib/first-video-offer";

// Static on purpose (no session read) so it is publicly cacheable per next.config.ts headers.
export const metadata: Metadata = {
  title: "Terms of Service and Refund Policy",
  description: "The terms for using Komendly Ads and Komendly Testimonials, including credits, subscriptions, cancellation and our money-back guarantees.",
  alternates: { canonical: "/terms" },
};

const plans = ADS_PLANS.map((p) => `${p.name} ${formatUsd(p.priceCents)}/month (${p.monthlyCredits} credits)`).join(", ");
const topups = ADS_TOPUPS.map((t) => `${t.credits} credits for ${formatUsd(t.priceCents)}`).join(" and ");

const SECTIONS: readonly LegalSection[] = [
  {
    id: "service",
    title: "The service",
    body: (
      <>
        <p>Komendly (&quot;we&quot;) offers two products on komendly.com:</p>
        <ul>
          <li><strong>Komendly Ads:</strong> reads a website you give us and uses AI to make ad creatives (images, animated ads and copy). On eligible plans it can publish ads to a Meta ad account you connect.</li>
          <li><strong>Komendly Testimonials:</strong> turns customer reviews into AI-avatar video testimonials.</li>
        </ul>
        <p>By creating an account or paying, you agree to these terms and our <Link href="/privacy">Privacy Policy</Link>. If you use Komendly for a business, you agree on its behalf.</p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Your account",
    body: <p>You must be at least 16 and give a real email address. Keep your password safe; you are responsible for what happens in your account. One free trial per business, device and email: creating extra accounts to get more free trials is not allowed, and we may block or close them.</p>,
  },
  {
    id: "credits",
    title: "Credits",
    body: (
      <ul>
        <li>Komendly Ads uses credits. One credit makes one ad in one size; making more sizes or animated ads uses more.</li>
        <li>Credits are tied to your workspace. They have no cash value and cannot be transferred, sold or exchanged.</li>
        <li>Credits included in a plan are used first and unused ones expire when the plan renews. Top-up credits ({topups}) do not expire while your account is open.</li>
        <li>Testimonial plans include a number of videos per billing period (up to 60 seconds each). Extra videos bought as packs are added to your allowance.</li>
        <li>If a Komendly Ads payment is refunded, the credits it bought are removed from your balance (never below zero).</li>
      </ul>
    ),
  },
  {
    id: "subscriptions",
    title: "Subscriptions, renewal and cancellation",
    body: (
      <ul>
        <li>Komendly Ads plans: {plans}. The {LAUNCH_QUARTER.name} offer is {formatUsd(LAUNCH_QUARTER.priceCents)} every {LAUNCH_QUARTER.intervalMonths} months with {LAUNCH_QUARTER.creditsPerPeriod} credits per period (plus {LAUNCH_QUARTER.firstPeriodBonus} bonus credits on the first payment).</li>
        <li>Subscriptions renew automatically at the end of each period and Stripe charges the card on file until you cancel. Prices are in US dollars, plus any tax shown at checkout.</li>
        <li>You can cancel any time from your billing page. Cancelling stops future renewals; you keep access until the end of the period you have paid for. Apart from the guarantees below, we do not refund part-used periods.</li>
        <li>We may change prices for future periods. We will tell you before a change affects your next renewal so you can cancel first.</li>
      </ul>
    ),
  },
  {
    id: "refunds",
    title: "Refund policy and money-back guarantees",
    body: (
      <>
        <p><strong>Komendly Ads plans:</strong> 30-day money-back guarantee on your first month. Not happy with the ads? Ask within 30 days of your first payment and we refund it.</p>
        <p><strong>{LAUNCH_QUARTER.name}:</strong> 30-day money-back guarantee on your first payment. Not happy with the ads? Ask within 30 days of your first payment and we refund it.</p>
        <p><strong>Testimonials {FIRST_VIDEO_OFFER.name}:</strong> looks real or it&apos;s free: unlimited re-renders, or a full refund on your {FIRST_VIDEO_OFFER.name} within 14 days.</p>
        <p>The guarantees cover the first payment only, once per customer. Renewals, top-up credit packs, testimonial video packs and later subscription payments are not refundable, except where the law gives you a right to a refund or we made a billing mistake. To ask for a refund, email us from your account address. Refunds go back to the original payment method through Stripe.</p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>You may only use Komendly for websites, brands, reviews and images that you own or are authorised to advertise. You must not use it to:</p>
        <ul>
          <li>make ads for anything Meta&apos;s Advertising Standards prohibit (for example illegal products, weapons, tobacco and drugs, adult content, deceptive or misleading claims, or discriminatory targeting);</li>
          <li>infringe anyone&apos;s trademarks, copyright, privacy or publicity rights, or impersonate a person or brand;</li>
          <li>publish fake reviews or testimonials, or present AI avatars as real customers where that misleads people;</li>
          <li>break the law, send spam, or attack, scrape, overload or reverse-engineer the service.</li>
        </ul>
        <p>We may refuse a website, stop a run, or suspend an account that breaks these rules.</p>
      </>
    ),
  },
  {
    id: "your-ads",
    title: "You are responsible for your ads",
    body: <p>You decide which ads to run and where. Before you publish, check that every claim, price, image and testimonial is true and allowed, and that the ad follows Meta&apos;s and other platforms&apos; policies and advertising law. If you connect Meta, we publish only what you ask us to, to the ad account you choose; your ad spend is billed by Meta, not by us, and Meta decides whether to approve an ad.</p>,
  },
  {
    id: "ai",
    title: "AI-generated content",
    body: <p>Ads, copy, avatars, voices and videos are made by AI models. They can contain mistakes, odd details or wording similar to other content, and results vary between runs. We do not promise any ad results (clicks, sales or approval by a platform). Review everything before you use it.</p>,
  },
  {
    id: "ip",
    title: "Ownership",
    body: (
      <ul>
        <li>You keep all rights in what you give us (your website, brand, reviews and images) and grant us a licence to use it only to provide the service to you.</li>
        <li>As between you and us, you own the ads and videos generated for you and may use them commercially.</li>
        <li>We will not show your ads or videos publicly, for example as examples on our website, unless you give us permission.</li>
        <li>Komendly&apos;s software, brand and Ozzy the mascot remain ours.</li>
      </ul>
    ),
  },
  {
    id: "availability",
    title: "Availability and termination",
    body: <p>We work to keep Komendly running but cannot promise it will always be available or error-free. Generated ad files are kept for 7 days, so download what you need. You can stop using Komendly and ask us to delete your account at any time. We may suspend or close accounts that break these terms.</p>,
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: <p>Komendly is provided &quot;as is&quot;. To the extent the law allows, we are not liable for indirect or consequential losses, lost profits, ad spend, or platform account restrictions, and our total liability is limited to what you paid us in the 12 months before the claim. Nothing here limits liability that cannot be limited by law, or your statutory consumer rights. You agree to cover our losses from claims caused by content you supplied or ads you published.</p>,
  },
  {
    id: "law",
    title: "Governing law",
    body: <p>These terms are governed by the laws of the place where Komendly is established, and disputes go to its courts, unless the consumer law where you live gives you the right to bring a claim locally.</p>,
  },
  {
    id: "changes",
    title: "Changes",
    body: <p>We may update these terms. We will change the date at the top and tell you about important changes by email or in the app. If you keep using Komendly after a change takes effect, the new terms apply.</p>,
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={<p>The rules for using Komendly, in plain English. The refund policy is in <a href="#refunds" className="text-[var(--studio-gold)] underline underline-offset-2">section 5</a>.</p>}
      sections={SECTIONS}
    />
  );
}
