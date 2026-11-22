import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { UNLIMITED_WEEK, UNLIMITED_WEEK_DAYS, ADS_PLANS, ADS_TOPUPS, FOUNDING_PRICE_LOCK, FOUNDING_TERMS, LAUNCH_QUARTER, offerFirstPaymentCents } from "@/lib/ads/billing-config";
import { FIRST_VIDEO_OFFER, formatUsd } from "@/lib/first-video-offer";

// Static on purpose (no session read) so it is publicly cacheable per next.config.ts headers.
export const metadata: Metadata = {
  title: "Terms of Service and Refund Policy",
  description: "The terms for using Komendly Ads and Komendly Testimonials, including credits, subscriptions, cancellation and our money-back guarantees.",
  alternates: { canonical: "/terms" },
};

const plans = ADS_PLANS.map((p) => `${p.name} ${formatUsd(p.priceCents)}/month (${p.usageMultiple ? `${p.usageMultiple}x Starter: ${p.monthlyCredits} credits` : `${p.monthlyCredits} credits`} a month)${p.hiddenForNewBuyers ? " (existing subscribers only)" : ""}`).join(", ");
const topups = ADS_TOPUPS.map((t) => `${t.credits} credits for ${formatUsd(t.priceCents)}`).join(" and ");

const SECTIONS: readonly LegalSection[] = [
  {
    id: "service",
    title: "The service",
    body: (
      <>
        <p>Komendly is operated by Grout Global LLC (&quot;Komendly&quot;, &quot;we&quot;), which offers two products on komendly.com:</p>
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
        <li>Komendly Ads plans: {plans}. Launch offer: within {LAUNCH_QUARTER.windowHours} hours of your free ads, the first month of the Ozzy Ad Department plan is {formatUsd(offerFirstPaymentCents(LAUNCH_QUARTER))}; it then renews at {formatUsd(LAUNCH_QUARTER.priceCents)}/month. {FOUNDING_TERMS} {FOUNDING_PRICE_LOCK} Growth Autopilot founding members keep their founding price for as long as they stay subscribed; founding spots are limited. Existing Launch Quarter subscribers keep their terms.</li>
        <li>{UNLIMITED_WEEK.name} (add-on for paid plans): {formatUsd(UNLIMITED_WEEK.priceCents)} one-time for {UNLIMITED_WEEK_DAYS} days of Ad Packs and Ozzy Studio videos at no credit cost, one in progress at a time, for your own business (up to 10 brands on Agency). It does not renew. We may stop selling it at any time; a week you have already bought runs to its end. A refunded week ends when the refund is issued.</li>
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
        <p><strong>Komendly Ads plans and launch offers:</strong> 30-day money-back guarantee on your first payment. Within 30 days of it, use &quot;Refund my first payment&quot; on your billing page: we refund it in full, end the plan and remove the credits it gave you.</p>
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
  // Managed advertising terms (prd.md §8). Placeholders filled 2026-11-22 with the recommended positions, per the founder's
  // legal counsel. Change only with counsel; these promises are enforced in code (engine/src/jobs/team-ops.ts).
  {
    id: "managed-advertising",
    title: "Managed advertising service (Ozzy's AI Marketing Team)",
    body: (
      <>
        <p>If you subscribe to Ozzy&apos;s AI Marketing Team (the Growth Autopilot plan) or Agency and switch the service on, Komendly runs Facebook and Instagram ads for your business on your behalf. In that case these terms apply in addition to the rest of this page, and where they differ from &quot;You are responsible for your ads&quot;, this section applies.</p>
        <ul>
          <li><strong>Your authorization.</strong> When you switch the service on you connect your Meta ad account and Facebook Page, set a monthly ad budget limit and tick a box authorizing us to create, run, change and pause ads in that ad account, spending at most that limit each calendar month. We keep a record of the exact wording you agreed to, when and by whom. This authority is limited to Komendly-created campaigns, ad sets, ads and lead forms in the ad account and Page you chose; it does not let us touch anything else in your account, move money, or act for you anywhere else. We act as your service provider, not as your employee, partner or general agent. The authority lasts while your plan is active and ends when your plan ends, you disconnect Meta or you withdraw it on your team page; after that we only pause what we created.</li>
          <li><strong>Your budget limit.</strong> We will not spend above the monthly limit you set; we also set a spending cap on the campaign in Meta. Only you can raise the limit. You can lower it or pause your ads at any time. Meta may deliver more than the daily amount on a single day, but the monthly limit and the campaign cap still apply. If, despite this, the campaigns we created spend more than your limit in a calendar month because of a failure on our side, we will reimburse the amount above the limit once you tell us within 60 days of the end of that month. Charges Meta makes outside the campaigns we created are not covered.</li>
          <li><strong>You pay Meta directly.</strong> Ad spend is charged by Meta to the payment method in your own ad account. It is never billed by Komendly and is not part of your subscription. You are responsible for paying Meta and for keeping a valid payment method there.</li>
          <li><strong>Your business, your claims.</strong> Ads are made from your website and the details you give us. You are responsible for the truth of the claims, prices and offers in them, and for holding any licences, permits or registrations your business and its advertising need. You review your ads and lead form on your team page and can pause any of them at any time. We do not run this service for ads in Meta&apos;s Special Ad Categories (housing, credit and financial services, employment, social issues, elections or politics) or for products and services that need a licence you do not hold, and you agree not to ask us to. The indemnity in &quot;Limitation of liability&quot; covers claims about the business facts, offers and licences you are responsible for.</li>
          <li><strong>Who the service is not for.</strong> We do not run campaigns that fall into Meta&apos;s special ad categories (housing, credit, employment, social issues, elections or politics).</li>
          <li><strong>No guaranteed results.</strong> We do not promise any number of leads, calls, customers, sales or any return on your ad spend. Results depend on your offer, area, market and on Meta. Ad spend is paid by you to Meta and is not a fee to Komendly; apart from the reimbursement promise above, we are not liable for ad spend, and the &quot;Limitation of liability&quot; section applies to this service.</li>
          <li><strong>Leads.</strong> When someone fills in a lead form on one of these ads, we receive their details from Meta, store them and email them to you. We use them only to deliver them to you; see &quot;Leads from ads we run for you&quot; in our <Link href="/privacy#ad-leads">Privacy Policy</Link>. You are responsible for how you contact and use your leads. For these leads we act as your service provider (processor): we process them only on your instructions to deliver them to you, keep them for 180 days, delete them sooner when you delete them on your team page or close your account, and do not sell or share them. You are the business responsible for the leads, including any consent you need before calling, texting or emailing them.</li>
          <li><strong>Pausing and cancellation.</strong> If you cancel, your plan runs to the end of the period you paid for and then we pause the campaigns we created. We pause them right away if you use the self-serve refund, disconnect Meta, or if your account is suspended. Paused campaigns stay in your ad account; we do not delete them. If a subscription payment fails, your ads keep running while our payment provider retries the charge (your ad spend is paid to Meta, not us); if the subscription then ends, we pause the campaigns. We email you whenever we pause your ads and say why. We may change or stop this service with 30 days&apos; email notice, and we pause your campaigns when it stops.</li>
          <li><strong>Platform rules.</strong> Meta decides whether to approve and deliver ads and may restrict accounts. We only touch campaigns we created. Meta&apos;s approvals, rejections and account restrictions are Meta&apos;s decisions and we are not responsible for them; when Meta rejects an ad we replace it with another, and when your account is restricted we stop making changes and tell you what Meta needs from you.</li>
        </ul>
      </>
    ),
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
