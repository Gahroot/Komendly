import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { loadHubItems } from "@/lib/hub/load-summary";
import { HUB_APPS, HUB_APP_LABEL, parseHubApp } from "@/lib/hub/summary";
import { HubItemTile } from "@/components/hub/hub-items";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Library" };
export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const app = parseHubApp((await searchParams).app);
  const ws = await getOrCreateWorkspace(user);
  const items = await loadHubItems(user, ws, { app, limit: 60 });
  const tabs = [{ key: null, label: "Everything" }, ...HUB_APPS.map((a) => ({ key: a, label: HUB_APP_LABEL[a] }))];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Library</h1>
        <p className="mt-1 text-muted-foreground">Everything you&apos;ve made with Ozzy, newest first.</p>
      </div>
      <nav aria-label="Filter by app" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.key ? `/dashboard/library?app=${t.key}` : "/dashboard/library"}
            aria-current={app === t.key ? "page" : undefined}
            className={cn("inline-flex min-h-10 items-center rounded-full border px-4 text-sm", app === t.key ? "border-[var(--studio-gold)] text-foreground" : "border-border text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {items.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{items.map((i) => <HubItemTile key={i.id} item={i} />)}</div>
      ) : (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nothing here yet.</div>
      )}
    </div>
  );
}
