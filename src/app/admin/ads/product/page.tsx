// /admin/ads/product: product-excellence cards. Admin-gated by AdminAdsShell. Add a card: see _cards/README.md
// (one explicit import + one CARDS entry, alphabetical by file name).
import type { ReactNode } from "react";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { BacklogCard } from "./_cards/backlog-card";
import { CompetitiveCard } from "./_cards/competitive-card";
import { DeliveryEconCard } from "./_cards/delivery-econ-card";
import { ReliabilityCard } from "./_cards/reliability-card";

export const dynamic = "force-dynamic";

const CARDS: Array<{ id: string; Card: () => Promise<ReactNode> | ReactNode }> = [
  { id: "backlog-card", Card: BacklogCard },
  { id: "competitive-card", Card: CompetitiveCard },
  { id: "delivery-econ-card", Card: DeliveryEconCard },
  { id: "reliability-card", Card: ReliabilityCard },
];

export default function ProductPage() {
  return (
    <AdminAdsShell title="Product excellence" description="Reliability, delivery economics, competitive position and the weekly product backlog. Read-only: nothing here changes prices or models.">
      <div className="space-y-6">{CARDS.map(({ id, Card }) => <Card key={id} />)}</div>
    </AdminAdsShell>
  );
}
