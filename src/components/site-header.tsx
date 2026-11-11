import Link from "next/link";
import { AdsMobileMenu } from "@/components/ads/ads-mobile-menu";
import { BrandMark } from "@/components/brand-mark";

const LINKS = [
  { href: "/ozzy-studio", label: "Ozzy Studio (new)" },
  { href: "/testimonials#examples", label: "Examples" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
];

/** Studio night nav for the testimonials product. */
export function SiteHeader({ cta = true }: { cta?: boolean }) {
  return (
    <header className="relative z-20">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main">
        <Link href="/" className="font-display flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
          <BrandMark className="size-8" />
          Komendly
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <Link href="/ozzy-studio" className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground lg:inline-flex">
            Ozzy Studio
            <span className="rounded-full bg-[var(--studio-gold)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase leading-none tracking-wider text-[#2a0f10]">New</span>
          </Link>
          {LINKS.slice(1).map((l) => (
            <Link key={l.href} href={l.href} className="hidden rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground sm:inline-block">{l.label}</Link>
          ))}
          <Link href="/login" className="hidden rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground sm:inline-block">Sign in</Link>
          {cta ? (
            <Link href="/testimonials#start" className="hidden rounded-lg border border-border px-3 py-2 font-medium text-foreground transition-colors hover:bg-accent sm:inline-block">Make my video</Link>
          ) : null}
          <AdsMobileMenu links={[...LINKS, { href: "/login", label: "Sign in" }]} cta={{ href: "/testimonials#start", label: "Make my first video" }} />
        </div>
      </nav>
    </header>
  );
}
