import Link from "next/link";
import { AdsMobileMenu } from "@/components/ads/ads-mobile-menu";
import { BrandMark } from "@/components/brand-mark";

const LINK = "hidden rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground";

/** Transparent night nav over the sky (marketing pages). One front door: /login, /register, /dashboard. */
export function StudioNav({ signedIn }: { signedIn: boolean }) {
  const links = [
    { href: "/ozzy-studio", label: "Ozzy Studio (new)" },
    { href: "/#examples", label: "Examples" },
    { href: "/pricing", label: "Pricing" },
    { href: "/blog", label: "Blog" },
  ];
  return (
    <header className="relative z-20">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main">
        <Link href="/" className="font-display flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
          <BrandMark className="size-8" />
          Komendly
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <Link href="/ozzy-studio" className={`${LINK} sm:inline-flex sm:items-center sm:gap-1.5`}>
            Ozzy Studio
            <span className="rounded-full bg-[var(--studio-gold)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase leading-none tracking-wider text-[#2a0f10]">New</span>
          </Link>
          <Link href="/#examples" className={`${LINK} md:inline-block`}>Examples</Link>
          <Link href="/pricing" className={`${LINK} sm:inline-block`}>Pricing</Link>
          <Link href="/blog" className={`${LINK} md:inline-block`}>Blog</Link>
          {signedIn ? (
            <Link href="/dashboard" className="rounded-lg border border-border px-3 py-2 font-medium text-foreground transition-colors hover:bg-accent">Dashboard</Link>
          ) : (
            <>
              <Link href="/login" className={`${LINK} sm:inline-block`}>Sign in</Link>
              <Link href="/register" className="hidden rounded-lg border border-border px-3 py-2 font-medium text-foreground transition-colors hover:bg-accent sm:inline-block">Try free</Link>
            </>
          )}
          <AdsMobileMenu
            links={signedIn ? [{ href: "/dashboard", label: "Dashboard" }, ...links] : [...links, { href: "/login", label: "Sign in" }]}
            cta={signedIn ? undefined : { href: "/register", label: "Try free" }}
          />
        </div>
      </nav>
    </header>
  );
}
