import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard, Film, MessageSquareQuote, Rocket, Sparkles, Zap } from "lucide-react";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
import { SiteFooter } from "@/components/site-footer";
import { fraunces } from "@/components/studio/fonts";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { StudioSky } from "@/components/studio/studio-sky";
import "@/components/studio/studio.css";
import { ADS_GUARANTEE, ADS_PLANS } from "@/lib/ads/billing-config";
import { faqJsonLd, graph, jsonLdString, studioApplicationJsonLd } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site";
import { STUDIO_INVITE, STUDIO_MAX_SECONDS, STUDIO_PRICE, STUDIO_UPLOAD_LIMITS } from "@/lib/studio/contracts";
import { ChatDemo } from "./chat-demo";
import { StudioPrompt } from "./studio-prompt";

export const metadata: Metadata = {
  title: "Ozzy Studio: make video ads by chatting",
  description:
    "Tell Ozzy what you want and get a scroll-stopping video: promos, hype ads, logo animations and edits of your own footage with captions. Your first video is free.",
  alternates: { canonical: "/ozzy-studio" },
  openGraph: { title: "Ozzy Studio: make video ads by chatting", url: "/ozzy-studio" },
};

const MB = (b: number) => Math.round(b / (1024 * 1024));
const cheapest = ADS_PLANS.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));

const EXAMPLES = [
  { id: "ozzy-v07", label: "Ozzy Studio: “Their ad moves”", start: 0 },
  { id: "dessert", label: "Dessert shop: “Cookies AND ice cream”" },
  { id: "ad08", label: "Komendly: “What do I even say?”", start: 0 },
  { id: "plumber", label: "Plumber: “Leaking again?”" },
  { id: "landscaper", label: "Landscaper: “More than mowing”" },
  { id: "ad43", label: "Komendly: “Hours on one ad”", start: 5 },
  { id: "roofer", label: "Roofer: “My roof’s leaking”" },
  { id: "ozzy-v10", label: "Ozzy Studio: “Can’t edit video?”", start: 7 },
  { id: "dentist", label: "Dentist: “I keep putting it off”" },
  { id: "ad53", label: "Komendly: “That’s why we built this”", start: 9 },
] as const;

const MAKES = [
  { icon: Zap, title: "Promos", body: "A 15-second promo for your business, from a sentence and your website." },
  { icon: Sparkles, title: "Hype ads", body: "Fast cuts, bold type and a punchy beat, sized 9:16 for Reels and TikTok." },
  { icon: Clapperboard, title: "Logo animations", body: "Drop in your logo and get a short animated intro or outro." },
  { icon: Film, title: "Footage edits", body: "Upload your clips; Ozzy cuts them into an ad with animated captions." },
  { icon: Rocket, title: "Launch videos", body: "Announce a new product, menu item or offer with a short launch video." },
  { icon: MessageSquareQuote, title: "Reviews to motion graphics", body: "Turn a customer review into a bold animated quote." },
] as const;

const STEPS = [
  { title: "Tell Ozzy what you want", body: "Type it like a message. Add your website, logo or clips if you have them." },
  { title: "Watch him build it", body: "Ozzy replies as he works and shows each step. If something is unclear, he asks." },
  { title: "Revise by chatting", body: `“Make the captions yellow.” Your first ${STUDIO_PRICE.includedRevisions} revisions of each video are included.` },
] as const;

const FAQ = [
  {
    q: "What is a credit?",
    a: `Credits are the one wallet for Ozzy Studio and Ad Packs. A new Studio video costs ${STUDIO_PRICE.newShort} credits (up to ${STUDIO_PRICE.longOverSeconds}s) or ${STUDIO_PRICE.newLong} credits (longer). The first ${STUDIO_PRICE.includedRevisions} revisions of a video are included; later revisions cost ${STUDIO_PRICE.revision} credit each. Plans add credits every month.`,
  },
  {
    q: "Can I upload my own footage?",
    a: `Yes. On a paid plan you can upload files up to ${MB(STUDIO_UPLOAD_LIMITS.maxBytes)} MB and make videos up to ${STUDIO_MAX_SECONDS.paid} seconds. On the free video, uploads go up to ${MB(STUDIO_UPLOAD_LIMITS.maxBytesFree)} MB and videos up to ${STUDIO_MAX_SECONDS.free} seconds. Video, images and audio all work.`,
  },
  {
    q: "Is there a watermark?",
    a: "No. Your free video is yours to post as-is: no watermark, no branding. Paid videos don’t have one either.",
  },
  {
    q: "Who owns the video?",
    a: "You do. You can download it and use it in your ads, on social and on your website. See our terms for the details.",
  },
  {
    q: "How long does a video take?",
    a: "It depends on the video. Ozzy shows each step and the real render progress while he works, so you can see where he is.",
  },
] as const;

const jsonLd = graph(studioApplicationJsonLd(), faqJsonLd(FAQ.map((f) => ({ q: f.q, a: f.a })), `${SITE_URL}/ozzy-studio`));

export default function OzzyStudioPage() {
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <div className="absolute inset-x-0 top-0 z-20"><StudioNav signedIn={false} /></div>
      <main>
        <section className="relative isolate overflow-hidden pb-20" aria-labelledby="hero-title">
          <div className="absolute inset-0"><StudioSky /><div className="studio-grain" aria-hidden /></div>
          <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-4 pt-24 text-center sm:px-6 sm:pt-32">
            <p className="studio-rise inline-flex items-center gap-2 rounded-full border border-border bg-[oklch(0.2_0.07_295/0.6)] px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)] backdrop-blur">
              New · Ozzy Studio · 1 free video
            </p>
            <h1 id="hero-title" className="studio-rise font-display mt-5 text-balance text-[2.5rem] font-medium leading-[1.04] tracking-[-0.025em] sm:text-6xl" style={{ ["--rise-delay" as string]: "80ms" }}>
              Tell Ozzy what you want. Get a <em className="italic text-[var(--studio-gold)]">scroll&#8209;stopping</em> video.
            </h1>
            <p className="studio-rise mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg" style={{ ["--rise-delay" as string]: "160ms" }}>
              Chat with Ozzy to make video ads, motion graphics and animations, or to edit your own footage with captions. Revise it by asking.
            </p>
            <div className="mt-6" aria-hidden><OzzyLazy size={112} perch="ledge" pose={{ form: "creator", expression: "happy", motion: "idle" }} /></div>
            <div className="studio-rise w-full max-w-2xl" style={{ ["--rise-delay" as string]: "240ms" }}>
              <StudioPrompt />
            </div>
          </div>
        </section>

        <div className="relative bg-[linear-gradient(180deg,#140818,#0c0820_30%)]">
          <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2" aria-labelledby="chat-title">
            <div className="space-y-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">How a chat goes</p>
              <h2 id="chat-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Like texting a motion designer who never sleeps</h2>
              <p className="text-muted-foreground">Ozzy streams his reply, shows each step while he builds, and drops the finished video right into the chat. Don’t like something? Say so, and he makes a new version.</p>
              <p className="text-xs text-muted-foreground">Example chat, replayed for illustration.</p>
            </div>
            <ChatDemo />
          </section>

          <section id="examples" className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="examples-title">
            <h2 id="examples-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">Made with Ozzy’s motion engine</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">Real 9:16 hype ads for local businesses, for Komendly and for Ozzy Studio itself, rendered by the same engine that powers Ozzy Studio. Each one started from a website and the prompt “make hype video ads that are super fast cuts and energetic”.</p>
            <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-5">
              {EXAMPLES.map((v) => (
                <li key={v.id} className="space-y-2">
                  <video className="aspect-[9/16] w-full rounded-2xl border border-border bg-[#0c0820] object-cover" src={`/studio-examples/${v.id}.mp4${"start" in v && v.start ? `#t=${v.start}` : ""}`} poster={`/studio-examples/${v.id}.jpg`} muted autoPlay loop playsInline preload="metadata" aria-label={v.label} />
                  <p className="text-xs text-muted-foreground">{v.label}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="make-title">
            <h2 id="make-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">What you can make</h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MAKES.map((m) => (
                <li key={m.title} className="rounded-2xl border border-border bg-[oklch(0.18_0.05_290/0.7)] p-6">
                  <m.icon className="size-5 text-[var(--studio-gold)]" aria-hidden />
                  <h3 className="mt-3 font-display text-xl font-medium">{m.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{m.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="how-title">
            <h2 id="how-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">How it works</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-border p-6">
                  <span className="font-mono text-sm text-[var(--studio-gold)]">0{i + 1}</span>
                  <h3 className="mt-2 font-display text-xl font-medium">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="price-title">
            <div className="grid gap-6 rounded-3xl border border-border bg-[oklch(0.18_0.06_295/0.7)] p-8 sm:p-10 lg:grid-cols-[1.3fr_1fr]">
              <div className="space-y-3">
                <h2 id="price-title" className="font-display text-3xl font-medium tracking-[-0.02em]">Your first video is free</h2>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>1 free Ozzy Studio video, no card, no watermark.</li>
                  <li>After that, a new video costs {STUDIO_PRICE.newShort} credits ({STUDIO_PRICE.newLong} if it runs over {STUDIO_PRICE.longOverSeconds}s), with {STUDIO_PRICE.includedRevisions} revisions included.</li>
                  <li>Plans start at ${cheapest.priceCents / 100}/month for {cheapest.monthlyCredits} credits, shared with Ad Packs. Edit your own footage up to 90s.</li>
                </ul>
                <p className="text-xs text-muted-foreground">{ADS_GUARANTEE}</p>
                <Link href="/pricing" className="inline-block text-sm font-medium text-[var(--studio-gold)] underline-offset-4 hover:underline">See all plans</Link>
              </div>
              <div className="rounded-2xl border border-border p-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Invite a friend</p>
                <p className="mt-2 font-display text-xl">Give a friend {STUDIO_INVITE.friendFreeVideos} free videos</p>
                <p className="mt-1 text-sm text-muted-foreground">Share your invite link from the Studio. When they join, you get {STUDIO_INVITE.senderRewardVideos} more free video too.</p>
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6" aria-labelledby="faq-title">
            <h2 id="faq-title" className="font-display text-3xl font-medium tracking-[-0.02em]">Questions</h2>
            <div className="mt-6 divide-y divide-border rounded-2xl border border-border">
              {FAQ.map((f) => (
                <details key={f.q} className="group p-5">
                  <summary className="cursor-pointer list-none font-medium text-foreground">{f.q}</summary>
                  <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="mx-auto max-w-3xl px-4 pb-16 pt-8 text-center sm:px-6" aria-labelledby="final-title">
            <h2 id="final-title" className="font-display text-3xl font-medium tracking-[-0.02em] sm:text-4xl">What should Ozzy make for you?</h2>
            <div className="mt-6"><StudioPrompt id="studio-prompt-final" /></div>
          </section>
          <SiteFooter />
        </div>
      </main>
    </StudioRoot>
  );
}
