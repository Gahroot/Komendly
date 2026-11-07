import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Check } from "lucide-react";
import { AdsNav } from "@/components/ads/ads-nav";
import { getCurrentUser } from "@/lib/auth";
import { ADS_GUARANTEE, ADS_PLANS, ADS_TOPUPS } from "@/lib/ads/billing-config";
import { formatCents } from "@/lib/ads/billing-format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Start free with 10 static ads + 1 animated ad. Plans from $49/month for every ratio, all awareness levels and Meta publishing.",
  alternates: { canonical: "/ads/pricing" },
};

const FREE = ["10 static ads + 1 animated ad", "Built from your real site and reviews", "PNG + MP4 export", "No card required"];

/** Public pricing. Buying happens on /ads/billing (signed in); signed-out visitors start free first. */
export default async function AdsPricingPage() {
  const signedIn = Boolean(await getCurrentUser());
  const planHref = signedIn ? "/ads/billing" : "/ads/signup?next=%2Fads%2Fbilling";
  return (
    <div className="min-h-screen">
      <AdsNav signedIn={signedIn} />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
        <div className="mx-auto max-w-2xl text-center">
          <Image src="/brand/ozzy-adventurer-cool.png" alt="" width={112} height={112} unoptimized className="mx-auto [image-rendering:pixelated]" />
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Pricing</p>
          <h1 className="font-display mt-3 text-balance text-4xl font-medium tracking-[-0.02em] sm:text-6xl">Start free, upgrade when the ads work</h1>
          <p className="mt-4 text-muted-foreground">1 credit = 1 static ad in one size. An animated ad costs 5 credits. Cancel any time.</p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-4">
          <PlanCard name="Free trial" price="$0" note="once" items={FREE} cta={signedIn ? "Make my ads" : "Make my free ads"} href={signedIn ? "/ads/app" : "/#studio-url"} />
          {ADS_PLANS.map((p) => (
            <PlanCard key={p.key} name={p.name} price={formatCents(p.priceCents)} note="/ month" items={p.highlights} cta={`Choose ${p.name}`} href={planHref} featured={p.key === "growth"} />
          ))}
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
          <div className="glass rounded-2xl p-6">
            <h2 className="font-display text-2xl font-medium">Just need a few more?</h2>
            <p className="mt-1 text-sm text-muted-foreground">One-time credit packs, no subscription: {ADS_TOPUPS.map((t) => `${t.name} for ${formatCents(t.priceCents)}`).join(" · ")}.</p>
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">{ADS_GUARANTEE}</p>
        </div>
      </main>
    </div>
  );
}

function PlanCard({ name, price, note, items, cta, href, featured }: { name: string; price: string; note: string; items: readonly string[]; cta: string; href: string; featured?: boolean }) {
  return (
    <section className={cn("glass relative flex flex-col rounded-2xl p-6", featured && "ring-2 ring-[var(--studio-gold)]")} aria-label={name}>
      {featured && <span className="absolute -top-3 left-6 rounded-full bg-[var(--studio-gold)] px-2.5 py-0.5 text-xs font-semibold text-[#2a0f10]">Most popular</span>}
      <h2 className="font-display text-xl font-medium">{name}</h2>
      <p className="mt-3 flex items-baseline gap-1"><span className="text-4xl font-semibold tabular-nums">{price}</span><span className="text-sm text-muted-foreground">{note}</span></p>
      <ul className="mt-5 flex-1 space-y-2.5 text-sm">
        {items.map((i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[var(--studio-gold)]" />{i}</li>)}
      </ul>
      <Link href={href} className={cn("mt-6 inline-flex h-11 items-center justify-center rounded-xl font-semibold", featured ? "spellbar__cta" : "border border-border text-foreground transition-colors hover:bg-accent")}>{cta}</Link>
    </section>
  );
}
