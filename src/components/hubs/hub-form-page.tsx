import type { ReactNode } from "react";
import { HubForm } from "@/components/hubs/hub-form";
import { HubShell } from "@/components/hubs/hub-shell";
import { HUB_CONFIGS, type HubKind } from "@/lib/growth/creative-hubs";
import { hubsEnabled } from "@/lib/growth/creative-hubs-server";

/** Server frame for a hub form page: shows the form only while the creative_hubs flag is on; `children` = terms / extra copy. */
export async function HubFormPage({ kind, children, defaults, titleOverride }: { kind: HubKind; children?: ReactNode; defaults?: Record<string, string>; titleOverride?: string }) {
  const cfg = HUB_CONFIGS[kind];
  const open = await hubsEnabled();
  return (
    <HubShell title={titleOverride ?? cfg.title} lead={cfg.lead}>
      {open ? <HubForm config={cfg} defaults={defaults} /> : <p className="rounded-2xl border border-border p-5 text-muted-foreground">This isn&apos;t open yet. Check back soon.</p>}
      {children && <div className="mt-10 space-y-3 text-sm text-muted-foreground">{children}</div>}
    </HubShell>
  );
}
