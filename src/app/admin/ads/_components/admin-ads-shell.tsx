import type { ReactNode } from "react";
import { getAdminUser } from "@/lib/ads/billing-auth";
import { AdminAdsNav } from "./admin-ads-nav";

export async function AdminAdsShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const admin = await getAdminUser();
  if (!admin) return <p className="text-destructive">Admin access required.</p>;
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Website2ads</p>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <AdminAdsNav />
      {children}
    </div>
  );
}
