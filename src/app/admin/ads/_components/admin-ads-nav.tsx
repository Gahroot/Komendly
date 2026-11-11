"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/ads", label: "Overview" },
  { href: "/admin/ads/funnel", label: "Funnel" },
  { href: "/admin/ads/signups", label: "Sign-ups" },
  { href: "/admin/ads/growth", label: "Growth" },
  { href: "/admin/ads/referrals", label: "Referrals" },
  { href: "/admin/ads/gifts", label: "Gifts" },
  { href: "/admin/ads/outbound", label: "Outbound" },
  { href: "/admin/ads/partners", label: "Partners" },
  { href: "/admin/ads/features", label: "Ad of week" },
  { href: "/admin/ads/workspaces", label: "Workspaces" },
  { href: "/admin/ads/refunds", label: "Refunds" },
  { href: "/admin/ads/churn", label: "Churn" },
  { href: "/admin/ads/abuse", label: "Abuse" },
  { href: "/admin/ads/jobs", label: "Jobs" },
  { href: "/admin/ads/engine", label: "Engine" },
  { href: "/admin/ads/flags", label: "Flags" },
  { href: "/admin/ads/emails", label: "Emails" },
];

export function AdminAdsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1" aria-label="Website2ads admin">
      {TABS.map((t) => {
        const active = t.href === "/admin/ads" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
