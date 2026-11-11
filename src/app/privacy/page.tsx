import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";

// Static on purpose (no session read) so it is publicly cacheable per next.config.ts headers.
export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Komendly collects, why, who processes it, how long we keep it, the cookies we use and your rights.",
  alternates: { canonical: "/privacy" },
};

const COOKIES: { name: string; purpose: string; life: string }[] = [
  { name: "session_token", purpose: "Keeps you signed in (strictly necessary)", life: "30 days" },
  { name: "ads_device", purpose: "Random device id used to keep the free trial to one per device (fraud prevention)", life: "1 year" },
  { name: "kmd_aid", purpose: "Random anonymous visitor id for A/B tests", life: "180 days" },
  { name: "kmd_exp", purpose: "Which A/B test variants you see", life: "180 days" },
  { name: "kmd_ft", purpose: "First visit source: UTM tags, fbclid, referring site, landing page", life: "90 days" },
  { name: "kmd_lt", purpose: "Latest visit source (same fields as kmd_ft)", life: "90 days" },
  { name: "kmd_meid_<Event>", purpose: "Shared event id so Meta counts a conversion once, not twice", life: "10 minutes" },
  { name: "_fbp, _fbc", purpose: "Meta Pixel browser id and ad-click id (we may set _fbc from the fbclid in the link you clicked)", life: "Set by Meta; _fbc up to 90 days when we set it" },
  { name: "_ga, _ga_*", purpose: "Google Analytics 4 visitor and session ids", life: "Set by Google (up to 2 years)" },
];

const SECTIONS: readonly LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <p>Komendly runs komendly.com and its two products: Komendly Ads (turns your website into ad creatives and can publish them to your Meta ad account) and Komendly Testimonials (turns customer reviews into AI-avatar videos). In this policy &quot;we&quot; means Komendly, the controller of the personal data described here. To contact us about privacy, reply to any email we have sent you or write to us from the email address on your account.</p>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <ul>
        <li><strong>Account data:</strong> name, email address and a salted hash of your password (we never store the password itself).</li>
        <li><strong>What you give us to work with:</strong> website URLs, the brand details, text and images we pull from those sites, review text, scripts, uploaded images, and the ads and videos we generate for you.</li>
        <li><strong>Payment data:</strong> Stripe handles your card. We receive your plan, payment status, amounts and Stripe customer and payment ids, never your full card number.</li>
        <li><strong>Meta connection (Ads, optional):</strong> if you connect Meta, we store an access token (encrypted at rest) and the ad account and Page ids you choose, so we can publish ads you ask us to publish and read their results.</li>
        <li><strong>Usage and device data:</strong> IP address, browser user agent, pages viewed, product events (for example sign-up, run started, checkout, purchase), A/B test variants and the cookies listed below.</li>
        <li><strong>Visit source:</strong> UTM tags, Facebook click id (fbclid), the referring website and your first landing page.</li>
      </ul>
    ),
  },
  {
    id: "use",
    title: "Why we use it",
    body: (
      <ul>
        <li>To provide the service: create your account, generate ads and videos, publish to Meta when you ask, send account emails such as email verification (contract).</li>
        <li>To take payments, manage credits and handle refunds (contract and legal obligation).</li>
        <li>To prevent abuse, such as repeated free trials from the same device, email or business (legitimate interest).</li>
        <li>To measure and improve the product and our marketing: analytics, A/B tests and working out which ads and channels bring sign-ups (legitimate interest, or consent where the law requires it).</li>
      </ul>
    ),
  },
  {
    id: "ads-measurement",
    title: "Meta and Google ad measurement",
    body: (
      <>
        <p><strong>Meta Pixel and Conversions API.</strong> Our pages load the Meta Pixel, which records page views and steps like sign-up, trial start, checkout and purchase. Our server also sends some of those events directly to Meta (the Conversions API) with: your email address and account id, both hashed with SHA-256 before sending, your IP address, user agent, the _fbp and _fbc cookie values, the page URL, and the purchase value. Meta uses this to measure and optimise our ads and may combine it with what it already knows about you, under Meta&apos;s own privacy policy.</p>
        <p><strong>Google Analytics 4.</strong> We use GA4 to count visits and funnel steps (for example which A/B variant you saw). Google processes this under its own terms.</p>
        <p><strong>How to opt out:</strong></p>
        <ul>
          <li>Meta: <a href="https://www.facebook.com/adpreferences" target="_blank" rel="noopener noreferrer">Meta ad preferences</a> and your Off-Facebook / activity settings in Accounts Centre.</li>
          <li>Google: the <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">Google Analytics opt-out browser add-on</a> and <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">Google ad settings</a>.</li>
          <li>Industry tools: <a href="https://optout.aboutads.info" target="_blank" rel="noopener noreferrer">optout.aboutads.info</a> (US) and <a href="https://www.youronlinechoices.eu" target="_blank" rel="noopener noreferrer">youronlinechoices.eu</a> (EU/UK).</li>
          <li>You can also block or delete cookies in your browser. The site still works, but you will be signed out if you clear session_token.</li>
        </ul>
        <p>We do not sell your personal information for money. Sharing data with Meta and Google for ad measurement may count as &quot;sharing&quot; for cross-context behavioural advertising under California law; you can opt out using the tools above or by contacting us.</p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies we use",
    body: (
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead><tr className="border-b border-border text-foreground"><th className="p-3 font-medium">Cookie</th><th className="p-3 font-medium">Purpose</th><th className="p-3 font-medium">Lasts</th></tr></thead>
          <tbody>
            {COOKIES.map((c) => (
              <tr key={c.name} className="border-b border-border last:border-0 align-top"><td className="p-3 font-mono">{c.name}</td><td className="p-3">{c.purpose}</td><td className="p-3">{c.life}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: "processors",
    title: "Who processes your data",
    body: (
      <>
        <p>We share data only with the providers we need to run Komendly:</p>
        <ul>
          <li><strong>Vercel:</strong> website hosting.</li>
          <li><strong>Railway:</strong> database (Postgres), file storage for generated ads and the ad-generation worker.</li>
          <li><strong>Stripe:</strong> payments and billing.</li>
          <li><strong>OpenAI:</strong> reads your website content and writes and generates ad copy and images.</li>
          <li><strong>FAL, KIE, Mirage and voice (text-to-speech) providers:</strong> generate testimonial videos, avatars and voices from your scripts.</li>
          <li><strong>Our email provider:</strong> sends account and verification emails.</li>
          <li><strong>Meta:</strong> ad measurement (above) and, if you connect your account, publishing your ads.</li>
          <li><strong>Google:</strong> analytics.</li>
        </ul>
        <p>We may also disclose data if the law requires it, or to a buyer if Komendly is sold or merged.</p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <ul>
        <li>Account, brand and billing records: while your account is open. Billing records may be kept longer where tax or accounting law requires.</li>
        <li>Generated ad files from a run: automatically deleted from storage 7 days after they are made, so download what you want to keep. Brand assets (like your logo) stay until you delete your account.</li>
        <li>Testimonial videos are stored with our video providers and linked from your account.</li>
        <li>Sign-in sessions expire after 30 days. Cookie lifetimes are in the table above.</li>
        <li>When you ask us to delete your account, we delete or anonymise your personal data unless we must keep it by law.</li>
      </ul>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>Depending on where you live (for example the EU, UK or California), you can ask us to: see the data we hold about you, correct it, delete it, export it, stop or limit some uses (including ad measurement), and withdraw consent. Email us from your account address and we will answer within 30 days. We will not treat you differently for using these rights.</p>
        <p>If you are in the EU or UK you can also complain to your data protection authority (in the UK, the ICO).</p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>Komendly is a business tool and is not for anyone under 16. We do not knowingly collect data from children; if you think a child has given us data, contact us and we will delete it.</p>,
  },
  {
    id: "transfers",
    title: "International transfers",
    body: <p>Our providers, including Vercel, Railway, Stripe, OpenAI, Meta and Google, process data in the United States and other countries. Where data leaves the EU or UK, we rely on the providers&apos; Standard Contractual Clauses, the UK addendum or the EU-US Data Privacy Framework.</p>,
  },
  {
    id: "security",
    title: "Security",
    body: <p>We use HTTPS, hash passwords, encrypt Meta access tokens at rest and give out file download links that expire within minutes. No system is perfectly secure, but we work to protect your data.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: <p>If we change this policy we will update the date at the top, and for important changes we will tell you by email or in the app. See also our <Link href="/terms">Terms of Service</Link>.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={<p>Plain English: what we collect when you use Komendly, why, who helps us process it, how long we keep it and how to opt out.</p>}
      sections={SECTIONS}
    />
  );
}
