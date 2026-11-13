import type { ReactNode } from "react";
import { getAdminUser } from "@/lib/ads/billing-auth";
import { AdminAdsNav } from "./admin-ads-nav";
import { PageHeader } from "@/components/page-header";
import { AdminEmpty } from "../../_components/admin-empty";

export async function AdminAdsShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const admin = await getAdminUser();
  if (!admin) return <AdminEmpty>Admin access required. This bit of Ozzy HQ is just for admins.</AdminEmpty>;
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader eyebrow="Ad Packs" title={title} description={description} />
      <AdminAdsNav />
      {children}
    </div>
  );
}
