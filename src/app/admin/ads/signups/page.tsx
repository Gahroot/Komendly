import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents } from "@/lib/ads/billing-format";
import { parseFunnelQuery } from "@/lib/ads/funnel-queries";
import { SIGNUP_STAGES, STAGE_LABEL, parseSignupFilter, type SignupStage } from "@/lib/ads/signups";
import { loadSignups } from "@/lib/ads/signups-queries";
import { AdminAdsShell } from "../_components/admin-ads-shell";
import { AdminEmpty } from "../../_components/admin-empty";

export const dynamic = "force-dynamic";

type Search = { from?: string; to?: string; source?: string; stage?: string; test?: string };
const DAY_MS = 24 * 3600 * 1000;

export default async function AdminAdsSignupsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  return (
    <AdminAdsShell title="Sign-ups" description="One row per ads sign-up (newest first) with every funnel step. Times are UTC.">
      <Signups sp={sp} />
    </AdminAdsShell>
  );
}

const ts = (d: Date | null) => (d ? `${d.toISOString().slice(5, 16).replace("T", " ")}` : "—");
const STAGE_VARIANT: Record<SignupStage, "default" | "secondary" | "destructive" | "outline"> = {
  not_verified: "destructive", verified_no_trial: "outline", trial_running: "secondary", trial_done: "secondary", checkout_started: "outline", paid: "default", churned: "destructive",
};

async function Signups({ sp }: { sp: Search }) {
  const { from, to } = parseFunnelQuery(sp);
  const range = sp.from ? { from, to } : { from: new Date(to.getTime() - 14 * DAY_MS), to };
  const filter = parseSignupFilter(sp);
  const { rows, total, names } = await loadSignups(range.from, range.to, filter);
  const day = (x: Date) => x.toISOString().slice(0, 10);
  const named = (id: string | null) => (id ? <span title={id}>{names.get(id) ?? id}</span> : "—");
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-3 text-sm">
        <label className="grid gap-1">From<input className="rounded border bg-background px-2 py-1" type="date" name="from" defaultValue={day(range.from)} /></label>
        <label className="grid gap-1">To<input className="rounded border bg-background px-2 py-1" type="date" name="to" defaultValue={day(new Date(range.to.getTime() - 1))} /></label>
        <label className="grid gap-1">Source
          <select className="rounded border bg-background px-2 py-1" name="source" defaultValue={filter.source}>
            <option value="all">All</option><option value="facebook">Facebook / Meta</option><option value="other">Other</option>
          </select>
        </label>
        <label className="grid gap-1">Stage
          <select className="rounded border bg-background px-2 py-1" name="stage" defaultValue={filter.stage}>
            <option value="all">All</option>
            {SIGNUP_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1"><input type="checkbox" name="test" value="1" defaultChecked={filter.showTest} /> Show e2e test users</label>
        <button className="rounded border px-3 py-1" type="submit">Apply</button>
        <span className="text-muted-foreground">{rows.length} shown of {total} sign-ups · times UTC (MM-DD HH:MM)</span>
      </form>
      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead><TableHead>Signed up</TableHead><TableHead>Email</TableHead><TableHead>Workspace</TableHead><TableHead>Source / campaign / ad</TableHead>
                <TableHead>Verified</TableHead><TableHead>Website(s)</TableHead><TableHead>Trial started</TableHead><TableHead>First ad</TableHead><TableHead>Run done</TableHead>
                <TableHead>Ads ready</TableHead><TableHead>Downloads</TableHead><TableHead>Upsell shown</TableHead><TableHead>Checkout</TableHead><TableHead>Paid</TableHead><TableHead>Plan / status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.workspaceId}-${r.signedUpAt.getTime()}`}>
                  <TableCell><Badge variant={STAGE_VARIANT[r.stage]}>{STAGE_LABEL[r.stage]}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap">{ts(r.signedUpAt)}</TableCell>
                  <TableCell>{r.email}{r.isTest && <Badge variant="outline" className="ml-1">e2e</Badge>}</TableCell>
                  <TableCell><Link className="hover:underline" href={`/admin/ads/workspaces/${r.workspaceId}`}>{r.workspaceName}</Link></TableCell>
                  <TableCell className="max-w-xs text-xs">
                    <div>{r.utmSource ?? (r.isMeta ? "facebook (fbclid)" : "direct")}</div>
                    {r.utmCampaign && <div className="truncate">{named(r.utmCampaign)}</div>}
                    {r.utmContent && <div className="truncate text-muted-foreground">ad: {named(r.utmContent)}</div>}
                    {r.utmTerm && <div className="truncate text-muted-foreground">set: {named(r.utmTerm)}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{r.emailVerifiedAt ? ts(r.emailVerifiedAt) : <span className="font-semibold text-destructive">not verified</span>}</TableCell>
                  <TableCell className="max-w-xs text-xs">{r.websites.length ? r.websites.map((u) => <div key={u} className="truncate" title={u}>{u}</div>) : "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{ts(r.trialStartedAt)}</TableCell>
                  <TableCell className="whitespace-nowrap">{ts(r.firstAdReadyAt)}</TableCell>
                  <TableCell className="whitespace-nowrap">{ts(r.runCompletedAt)}</TableCell>
                  <TableCell>{r.adsReady}/{r.adsTotal}</TableCell>
                  <TableCell>{r.downloads}</TableCell>
                  <TableCell className="whitespace-nowrap">{ts(r.upsellShownAt)}</TableCell>
                  <TableCell className="whitespace-nowrap">{ts(r.checkoutStartedAt)}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.paidAt ? <>{ts(r.paidAt)}<div className="text-xs">{formatCents(r.paidCents)}</div></> : "—"}</TableCell>
                  <TableCell className="text-xs">{r.plan}<div className="text-muted-foreground">{r.subscriptionStatus}</div></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={16}><AdminEmpty>No sign-ups in this range. Try a wider one.</AdminEmpty></TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
