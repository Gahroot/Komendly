import Link from "next/link";
import type { Metadata } from "next";
import { AdsNav } from "@/components/ads/ads-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Run your ads on Google: step by step", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg font-semibold">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm leading-relaxed">{children}</CardContent>
    </Card>
  );
}

export default async function GoogleAdsHelpPage() {
  const user = await getCurrentUser();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn={!!user} />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div className="space-y-1">
          <Link href="/ads/app" className="text-sm text-muted-foreground hover:text-foreground">← Back to your ads</Link>
          <h1 className="text-3xl font-semibold tracking-tight">Run your ads on Google</h1>
          <p className="text-muted-foreground">A short guide. No Google Ads experience needed.</p>
        </div>

        <Section title="How it works">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Open your finished ads and press <span className="font-medium">Run these on Google</span>.</li>
            <li>Connect a Google Ads account (three ways, below).</li>
            <li>Pick your ads, where your customers are, and a daily budget.</li>
            <li>Check the text ad. Komendly creates the campaign in your Google Ads account, paused.</li>
            <li>When you&apos;re ready, press <span className="font-medium">Start my ads</span>.</li>
          </ol>
          <p>The campaign lives in your own Google Ads account. You can see and change it there any time.</p>
        </Section>

        <Section title="Three ways to connect">
          <p className="font-medium">1. I don&apos;t have Google Ads yet</p>
          <p>Make a free account at <a className="text-primary underline-offset-4 hover:underline" href="https://ads.google.com/home/" target="_blank" rel="noreferrer">ads.google.com</a> first:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Sign in with your Google account.</li>
            <li>If Google asks you to make a campaign, choose <span className="font-medium">Switch to Expert Mode</span> or skip it. Komendly makes the campaign for you.</li>
            <li>Add your card under <span className="font-medium">Billing</span>.</li>
          </ol>
          <p>Then come back and use way 2 or 3.</p>
          <p className="font-medium">2. Sign in with Google</p>
          <p>Press <span className="font-medium">Sign in with Google</span>. Use the Google login you use for Google Ads. Google may warn that the app isn&apos;t verified yet. It&apos;s safe to continue: click Advanced, then Go to Komendly. Press Allow. You come back to Komendly by yourself.</p>
          <p className="font-medium">3. Give Komendly access with my account number</p>
          <p>Find your account number at the top right of Google Ads, next to your account name. It has 10 numbers, like 123-456-7890. Type it in Komendly and press <span className="font-medium">Send access request</span>. Then accept it in Google Ads:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Open Google Ads and sign in.</li>
            <li>Click <span className="font-medium">Admin</span> (the gear icon).</li>
            <li>Click <span className="font-medium">Access and security</span>, then the <span className="font-medium">Managers</span> tab.</li>
            <li>Find the request from Komendly and click <span className="font-medium">Accept</span>.</li>
          </ol>
          <p>Direct link: <a className="text-primary underline-offset-4 hover:underline" href="https://ads.google.com/aw/accountaccess/managers" target="_blank" rel="noreferrer">ads.google.com/aw/accountaccess/managers</a></p>
          <p>Komendly checks every few seconds and moves on when it sees you accepted.</p>
        </Section>

        <Section title="Billing">
          <p>Google needs a payment card before your ads can run. Add it in Google Ads under <span className="font-medium">Billing</span>.</p>
          <p>Google charges your card for the ads, not Komendly. Your Komendly plan stays the same.</p>
          <p>You set a daily budget. Google may spend a little more on some days and less on others, but not more than about 30.4 times your daily budget in a month.</p>
        </Section>

        <Section title="Google checks every new ad">
          <p>After your campaign is created, Google reviews the ads. This usually takes up to 1 business day.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><span className="font-medium">Under review</span>: Google is still checking. Nothing to do.</li>
            <li><span className="font-medium">Approved</span>: the ads can show once you start them.</li>
            <li><span className="font-medium">Not approved</span>: Komendly shows the reason in plain words and what to change. Change it, and Google checks again.</li>
          </ul>
        </Section>

        <Section title="Start, pause and stop">
          <p>Everything starts paused. Press <span className="font-medium">Start my ads</span> in Komendly, or turn the campaign on in Google Ads.</p>
          <p>To stop spending, press <span className="font-medium">Pause</span> in Komendly or pause the campaign in Google Ads. You can start it again later.</p>
          <p>To remove Komendly&apos;s access, use <span className="font-medium">Disconnect Google Ads</span> in the menu of the Google window. Your campaigns stay in Google Ads.</p>
        </Section>

        <Section title="Charges and refunds">
          <p>Ad spend is between you and Google. Questions about a charge or a refund for ad spend go to Google Ads support. Komendly can&apos;t refund money Google charged.</p>
        </Section>
      </main>
    </div>
  );
}
