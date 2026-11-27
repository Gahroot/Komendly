import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DELIVERY_EVENT, type DeliveryEcon } from "@/lib/product-intel/delivery-econ";
import { prisma } from "@/lib/prisma";

const usd = (v: number | null) => (v === null ? "n/a" : `$${v.toFixed(2)}`);
const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(0)}%`);

export async function DeliveryEconCard() {
  const row = await prisma.adsEvent.findFirst({ where: { name: DELIVERY_EVENT }, orderBy: { createdAt: "desc" }, select: { props: true, createdAt: true } });
  const e = row?.props as unknown as DeliveryEcon | undefined;
  return (
    <Card>
      <CardHeader><CardTitle>Delivery economics (sys_delivery_econ)</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!e ? <p>No snapshot yet: flag off or not run. Costs are API-list-price equivalents (Codex is flat-rate), so margins are conservative.</p> : (
          <>
            <p>Snapshot {e.day} · {e.windowDays}d window · confidence {e.confidence}. Paid pack avg {usd(e.costPerPackUsd.paid.avg)} (p90 {usd(e.costPerPackUsd.paid.p90)}); free pack (acquisition cost) {usd(e.freePackAcquisitionCostUsd)}; per ad {usd(e.costPerAdUsd.avg)}; per video {usd(e.costPerVideoUsd.avg)}; Studio turn {usd(e.costPerStudioTurnUsd.avg)}; per credit {usd(e.costPerCreditUsd)}.</p>
            <Table>
              <TableHeader><TableRow><TableHead>Offer</TableHead><TableHead>Price</TableHead><TableHead>Margin, all credits used</TableHead><TableHead>Margin, half used</TableHead></TableRow></TableHeader>
              <TableBody>{e.margins.map((m) => <TableRow key={m.key}><TableCell>{m.label}</TableCell><TableCell>${(m.priceCents / 100).toFixed(0)}</TableCell><TableCell>{pct(m.marginAllUsed)}</TableCell><TableCell>{pct(m.marginHalfUsed)}</TableCell></TableRow>)}</TableBody>
            </Table>
            <p className="font-medium">Cost hotspots</p>
            <ul className="list-disc pl-5 text-muted-foreground">{e.hotspots.map((h) => <li key={`${h.dim}${h.key}`}>{h.dim} {h.key}: {usd(h.costUsd)} ({pct(h.share)})</li>)}</ul>
            <p className="font-medium">Proposals (owner decides; nothing changes automatically)</p>
            <ul className="list-disc pl-5">{e.proposals.map((p) => <li key={p.id}>{p.title}{p.monthlySavingUsd !== null ? `, ~${usd(p.monthlySavingUsd)}/mo` : ""}. <span className="text-muted-foreground">{p.assumption} ({p.confidence} confidence)</span></li>)}</ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
