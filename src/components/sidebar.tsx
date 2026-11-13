"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sparkles, Megaphone, Video, Library, Gift, CreditCard, Settings, KeyRound, LogOut, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/useUser";
import { BrandMark } from "@/components/brand-mark";

export interface SidebarWallet {
  credits: number;
  freeStudioVideos: number;
  testimonialVideos: number | null;
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: string;
  /** Other paths that light this item up. */
  also?: string[];
}

const APPS: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: Home, exact: true },
  { label: "Ozzy Studio", href: "/studio", icon: Sparkles, badge: "New" },
  { label: "Ad Packs", href: "/ads/app", icon: Megaphone, also: ["/ads/runs", "/ads/brands", "/ads/start"] },
  { label: "Testimonials", href: "/dashboard/testimonials", icon: Video, also: ["/dashboard/create-fal", "/dashboard/create", "/dashboard/videos"] },
  { label: "Library", href: "/dashboard/library", icon: Library },
];
const ACCOUNT: NavItem[] = [
  { label: "Refer & earn", href: "/ads/refer", icon: Gift },
  { label: "Billing", href: "/ads/billing", icon: CreditCard, also: ["/dashboard/billing"] },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
  { label: "Ozzy for agents", href: "/dashboard/api", icon: KeyRound },
];

function isActive(pathname: string, item: NavItem): boolean {
  const hit = (p: string) => pathname === p || pathname.startsWith(p + "/");
  return item.exact ? pathname === item.href : hit(item.href) || (item.also ?? []).some(hit);
}

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const active = isActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-200",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon aria-hidden className={cn("size-[18px]", active && "text-[var(--studio-gold)]")} />
      {item.label}
      {item.badge ? (
        <span className="ml-auto rounded-full bg-[var(--studio-gold)] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#2a0f10]">{item.badge}</span>
      ) : null}
      {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] bg-[var(--studio-gold)]" /> : null}
    </Link>
  );
}

/** The Ozzy app switcher: one nav for every app, one wallet in the footer. */
export function Sidebar({ wallet, onNavigate }: { wallet?: SidebarWallet; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useUser();
  const displayName = user?.name || user?.email?.split("@")[0] || "You";

  return (
    <div className="flex h-full flex-col text-foreground">
      <div className="flex h-16 items-center px-6">
        <Link href="/dashboard" onClick={onNavigate} className="font-display flex items-center gap-2 text-xl font-semibold tracking-tight">
          <BrandMark className="size-7" />
          Komendly
        </Link>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3" aria-label="Apps">
        <div className="space-y-1">
          {APPS.map((item) => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}
        </div>
        <div className="space-y-1">
          <p className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Account</p>
          {ACCOUNT.map((item) => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}
        </div>
      </nav>

      <div className="space-y-3 border-t border-border p-4">
        {wallet ? (
          <Link href="/ads/billing" onClick={onNavigate} className="block rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-accent/60" aria-label="Your Ozzy wallet">
            <span className="flex items-baseline gap-1.5">
              <span className="font-display text-xl tabular-nums text-[var(--studio-gold)]">{wallet.credits}</span>
              <span className="text-muted-foreground">Ozzy {wallet.credits === 1 ? "credit" : "credits"}</span>
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {wallet.freeStudioVideos} free Studio {wallet.freeStudioVideos === 1 ? "video" : "videos"} left
              {wallet.testimonialVideos !== null ? ` · ${wallet.testimonialVideos} testimonial ${wallet.testimonialVideos === 1 ? "video" : "videos"}` : ""}
            </span>
          </Link>
        ) : null}
        <div className="min-w-0 px-1">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email ?? ""}</p>
        </div>
        <button type="button" onClick={logout} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
          <LogOut aria-hidden className="size-4" /> Log out
        </button>
      </div>
    </div>
  );
}
