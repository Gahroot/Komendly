import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs, CtaButton } from "@/components/ad-examples/parts";
import { MakeYoursUrlBox } from "@/components/ad-examples/url-box";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { FREE_TOOLS, TOOL_GROUPS } from "@/lib/growth/free-tools";
import { toolCtaHref } from "@/lib/growth/free-tools-links";
import { freeToolsEnabled } from "@/lib/growth/free-tools-server";
import { breadcrumbJsonLd, freeToolJsonLd, graph } from "@/lib/seo/jsonld";
import "@/components/studio/studio.css";

// Public, cacheable (ISR 5 min so the sys_free_tools kill switch shows quickly). No cookies read here.
export const revalidate = 300;

const DESCRIPTION = "Free, no-sign-up ad tools for small businesses: a free ad maker, ad copy, hook, caption and slogan generators, ad size guide, budget calculator, ad mockup generator, UGC, YouTube and LinkedIn ad script and copy tools, a Google Ads RSA headline generator, review reply and testimonial tools.";

export const metadata: Metadata = {
  title: "Free Facebook & Instagram Ad Tools for Small Businesses",
  description: DESCRIPTION,
  alternates: { canonical: "/tools" },
  openGraph: { title: "Free ad tools for small businesses", description: DESCRIPTION, url: "/tools" },
};

export default async function ToolsHub() {
  const on = await freeToolsEnabled();
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <JsonLd data={graph(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }]), ...FREE_TOOLS.map((t) => freeToolJsonLd({ name: t.name, description: t.description, path: `/tools/${t.slug}` })))} />
      <StudioNav signedIn={false} />
      <main className="px-4 sm:px-6">
        <header className="mx-auto max-w-3xl pt-8 text-center sm:pt-14">
          <div className="flex justify-center"><Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Free tools" }]} /></div>
          <h1 className="font-display mt-5 text-balance text-[2.3rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">Free ad tools for small businesses</h1>
          <p className="mx-auto mt-5 max-w-2xl text-muted-foreground sm:text-lg">No sign-up, no card. Real results right on the page.</p>
        </header>
        {on ? (
          <div className="mx-auto mt-12 max-w-4xl space-y-12">
          {TOOL_GROUPS.map(([group, label]) => (
          <section key={group} aria-labelledby={`g-${group}`}>
          <h2 id={`g-${group}`} className="font-display text-2xl font-medium">{label}</h2>
          <ul className="mt-5 grid gap-5 sm:grid-cols-2">
            {FREE_TOOLS.filter((t) => t.group === group).map((t) => (
              <li key={t.slug}>
                <Link href={`/tools/${t.slug}`} className="studio-frame block h-full rounded-xl p-6 transition hover:brightness-110">
                  <p className="font-display text-xl font-medium">{t.name}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{t.blurb}</p>
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">{t.ai ? "AI · free" : "Instant · free"}</p>
                </Link>
              </li>
            ))}
          </ul>
          </section>
          ))}
          </div>
        ) : (
          <p className="mx-auto mt-12 max-w-xl text-center text-muted-foreground">Our free tools are taking a short break. Back soon! Meanwhile, Ozzy can still make you 10 free ads from your website.</p>
        )}
        <section className="mx-auto mt-16 max-w-3xl text-center" aria-labelledby="full-title">
          <h2 id="full-title" className="font-display text-2xl font-medium sm:text-3xl">Want finished ads, not just words?</h2>
          <p className="mt-3 text-muted-foreground">Paste your website and Ozzy makes 10 ready-to-run Facebook &amp; Instagram ads plus an animated one, free.</p>
          <div className="mt-6"><MakeYoursUrlBox href={toolCtaHref("hub", "url_box")} /></div>
          <p className="mt-6 text-sm text-muted-foreground">Need ideas first? See <Link href="/ad-examples" className="text-[var(--studio-gold)] hover:underline">ad examples by industry</Link> or our <Link href="/reports/facebook-ad-statistics" className="text-[var(--studio-gold)] hover:underline">Facebook ad statistics</Link> from real small-business ads.</p>
        </section>
        <div className="flex justify-center py-16"><CtaButton href={toolCtaHref("hub", "end")}>Make my free ads</CtaButton></div>
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
