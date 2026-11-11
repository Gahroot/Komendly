import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AdsMobileMenu, type AdsNavLink } from "./ads-mobile-menu";
import { BrandMark } from "@/components/brand-mark";

const SIGNED_IN: AdsNavLink[] = [
  { href: "/dashboard", label: "← All apps" },
  { href: "/ads/app", label: "Home" },
  { href: "/ads/brands", label: "Brands" },
  { href: "/ads/gifts", label: "Gifts" },
  { href: "/ads/refer", label: "Give 10, get 10" },
  { href: "/ads/billing", label: "Billing" },
];
const SIGNED_OUT: AdsNavLink[] = [
  { href: "/ads/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
  { href: "/login", label: "Sign in" },
];
const TRY: AdsNavLink = { href: "/ads/signup", label: "Try free" };

export function AdsNav({ signedIn }: { signedIn: boolean }) {
  const links = signedIn ? SIGNED_IN : SIGNED_OUT;
  return (
    <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href={signedIn ? "/ads/app" : "/"} className="flex items-center gap-2 font-[family-name:var(--font-fraunces)] text-lg font-semibold tracking-tight">
          <BrandMark className="size-7" />
          Komendly
        </Link>
        <div className="flex items-center gap-1">
          <div className="hidden items-center gap-1 sm:flex">
            {links.map((l) => <Button key={l.href} asChild variant="ghost" size="sm"><Link href={l.href}>{l.label}</Link></Button>)}
          </div>
          {!signedIn && <Button asChild size="sm" className="ml-1"><Link href={TRY.href}>{TRY.label}</Link></Button>}
          <AdsMobileMenu links={links} cta={signedIn ? undefined : { href: "/ads/signup", label: "Make my free ads" }} />
        </div>
      </nav>
    </header>
  );
}
