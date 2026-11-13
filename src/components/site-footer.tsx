import Link from "next/link";
import { StudioPose } from "@/components/studio/studio-pose";
import { BrandMark } from "@/components/brand-mark";

const COLS = [
  { title: "Apps", links: [{ href: "/ozzy-studio", label: "Ozzy Studio" }, { href: "/", label: "Ad Packs" }, { href: "/testimonials", label: "Testimonials" }, { href: "/pricing", label: "Pricing" }, { href: "/login", label: "Sign in" }] },
  { title: "More", links: [{ href: "/examples", label: "Examples" }, { href: "/agents", label: "For AI agents" }, { href: "/ad-examples", label: "Ad examples" }, { href: "/blog", label: "Blog" }, { href: "/partners", label: "Partner program" }] },
  { title: "Legal", links: [{ href: "/privacy", label: "Privacy" }, { href: "/terms", label: "Terms" }, { href: "/terms#refunds", label: "Refunds" }] },
];

/** Quiet studio footer for the testimonials product: Ozzy dozes by the fire. */
export function SiteFooter() {
  return (
    <footer className="relative mt-10 border-t border-border" aria-label="Site footer">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <p className="font-display flex items-center gap-2 text-2xl font-semibold">
            <BrandMark className="size-8" />
            Komendly
          </p>
          <p className="max-w-xs text-sm text-muted-foreground">Ozzy makes your video ads, ad packs and testimonial videos. Built under the southern sky.</p>
          <div className="flex items-end gap-1" aria-hidden>
            <StudioPose form="chill" expression="sleepy" motion="sleep" size={72} />
            <div className="campfire mb-[10px]"><i /><i /><i /><span /></div>
          </div>
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={c.title} className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">{c.title}</p>
            <ul className="space-y-2">
              {c.links.map((l) => (
                <li key={l.href}><Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{l.label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted-foreground sm:px-6">© {new Date().getFullYear()} Komendly</p>
    </footer>
  );
}
