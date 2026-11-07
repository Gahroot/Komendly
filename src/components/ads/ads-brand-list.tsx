"use client";

import Link from "next/link";
import { ChevronRight, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdBrands } from "@/hooks/useAdBrands";
import { BrandAvatar } from "./brand-avatar";
import { BrandSwatches } from "./brand-swatches";

/** Brand profiles in the workspace; `limit` for the compact home-page version. */
export function AdsBrandList({ limit }: { limit?: number }) {
  const { data, error } = useAdBrands();
  if (error) return <p className="text-sm text-destructive">Couldn&apos;t load your brands. Refresh to try again.</p>;
  if (!data) return <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;
  if (data.brands.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Palette className="size-5" aria-hidden /></div>
        <p className="font-medium">No brand profiles yet</p>
        <p className="text-sm text-muted-foreground">We create one the first time you make ads for a website.</p>
        <Button asChild size="sm" variant="outline" className="mt-2"><Link href="/ads/app">Make ads</Link></Button>
      </div>
    );
  }
  const brands = limit ? data.brands.slice(0, limit) : data.brands;
  return (
    <ul className="space-y-2">
      {brands.map((b) => (
        <li key={b.id}>
          <Link href={`/ads/brands/${b.id}`} className="glass-subtle flex min-h-16 items-center gap-3 rounded-xl p-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
            <BrandAvatar name={b.name ?? b.domain} logoUrl={b.logoUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{b.name ?? b.domain}</p>
              <p className="truncate text-xs text-muted-foreground">{b.domain}</p>
            </div>
            <div className="hidden sm:block"><BrandSwatches colors={b.colors} max={limit ? 3 : 6} /></div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
