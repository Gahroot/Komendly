import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents } from "@/lib/ads/billing-format";
import type { FunnelRow } from "@/lib/ads/funnel";
import { loadPricingDropoff, loadSourceFunnel, loadStudioFunnel, parseFunnelQuery } from "@/lib/ads/funnel-queries";
import { AdminAdsShell } from "../_components/admin-ads-shell";

export const dynamic = "force-dynamic";

type Search = { from?: string; to?: string; by?: string; campaign?: string };

export default async function AdminAdsFunnelPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const q = parseFunnelQuery(sp);
  return (
    <AdminAdsShell title="Funnel by source" description="Landed → signed up → trial finished → paid → still paying, by first-touch source. Sign-ups and landings in range; later steps counted up to today.">
      <Funnel from={q.from} to={q.to} by={q.by} campaign={sp.campaign} />
      <div className="mt-6"><PricingDropoffCard from={q.from} to={q.to} /></div>
      <div className="mt-6"><StudioFunnelCard /></div>
    </AdminAdsShell>
  );
}

/** Pricing & offer drop-off in the chosen window (internal accounts excluded). */
async function PricingDropoffCard({ from, to }: { from: Date; to: Date }) {
  const d = await loadPricingDropoff(from, to);
  const yes = (b: boolean) => (b ? "yes" : "no");
  return (
    <Card>
      <CardHeader><CardTitle>Pricing &amp; offer drop-off</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Unique people in the window (each step counted on its own, not nested). % = vs previous step. Pricing views tracked in our DB since Nov 2026 (/pricing, /ads/pricing, /ads/billing, /dashboard/billing).{d.botViews > 0 ? ` Excluded ${d.botViews} Meta-review views.` : ""}</p>
        <Table>
          <TableHeader><TableRow><TableHead>Step</TableHead><TableHead>People</TableHead><TableHead>vs previous</TableHead></TableRow></TableHeader>
          <TableBody>
            {d.steps.map((s) => (
              <TableRow key={s.key}>
                <TableCell className="font-medium">{s.label}</TableCell>
                <TableCell>{s.count}{s.key === "viewed" && <span className="text-muted-foreground"> ({d.viewedSignedIn} signed in · {d.viewedSignedOut} signed out)</span>}</TableCell>
                <TableCell>{pct(s.fromPrev)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Table>
          <TableHeader><TableRow><TableHead>Last viewed</TableHead><TableHead>Page</TableHead><TableHead>Signed in</TableHead><TableHead>Had free pack</TableHead><TableHead>Clicked</TableHead><TableHead>Checkout</TableHead><TableHead>Paid</TableHead></TableRow></TableHeader>
          <TableBody>
            {d.recent.map((r) => (
              <TableRow key={r.person}>
                <TableCell>{r.lastViewAt.toISOString().slice(0, 16).replace("T", " ")}</TableCell>
                <TableCell>{r.page}</TableCell><TableCell>{yes(r.signedIn)}</TableCell><TableCell>{yes(r.hadFreePack)}</TableCell>
                <TableCell>{r.clicked.join(", ") || "—"}</TableCell><TableCell>{yes(r.checkedOut)}</TableCell><TableCell>{yes(r.paid)}</TableCell>
              </TableRow>
            ))}
            {d.recent.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No pricing views in this range.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Ozzy Studio funnel, sign-ups of the last 7 and 30 days (test emails excluded). */
async function StudioFunnelCard() {
  const now = new Date();
  const [w, m] = await Promise.all([loadStudioFunnel(7, now), loadStudioFunnel(30, now)]);
  return (
    <Card>
      <CardHeader><CardTitle>Ozzy Studio funnel</CardTitle></CardHeader>
      <CardContent>
        <p className="mb-2 text-sm text-muted-foreground">Workspaces that signed up in the window; later steps counted up to today. Paid = a payment after the first Studio render. % = vs previous step (vs sign-ups). Excluded {m.excludedTest} test sign-ups (30d).</p>
        <Table>
          <TableHeader><TableRow><TableHead>Step</TableHead><TableHead>Last 7 days</TableHead><TableHead>Last 30 days</TableHead></TableRow></TableHeader>
          <TableBody>
            {m.steps.map((s, i) => {
              const a = w.steps[i];
              return (
                <TableRow key={s.key}>
                  <TableCell className="font-medium">{s.label}</TableCell>
                  <TableCell>{a?.count ?? 0} <span className="text-muted-foreground">({pct(a?.fromPrev ?? null)} · {pct(a?.fromStart ?? null)})</span></TableCell>
                  <TableCell>{s.count} <span className="text-muted-foreground">({pct(s.fromPrev)} · {pct(s.fromStart)})</span></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const pct = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(1)}%`);
const money = (c: number | null) => (c === null ? "—" : formatCents(c));

function FunnelTable({ rows, keyLabel, showLanded = true }: { rows: FunnelRow[]; keyLabel: string; showLanded?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{keyLabel}</TableHead>
          {showLanded && <TableHead>Landed</TableHead>}
          {showLanded && <TableHead title="Visitor interacted or stayed 5 s (tracked since Nov 2026)">Engaged</TableHead>}
          <TableHead>Signed up</TableHead><TableHead>Trial done</TableHead><TableHead>Paid</TableHead>
          <TableHead>Active @30d</TableHead><TableHead>Active now</TableHead><TableHead>Revenue</TableHead><TableHead>GP 30d</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="font-medium">{r.key}</TableCell>
            {showLanded && <TableCell>{r.landed}</TableCell>}
            {showLanded && <TableCell>{r.engaged} <span className="text-muted-foreground">({pct(r.landed ? r.engaged / r.landed : null)})</span></TableCell>}
            <TableCell>{r.signedUp} {showLanded && <span className="text-muted-foreground">({pct(r.rates.signup)})</span>}</TableCell>
            <TableCell>{r.trialFinished} <span className="text-muted-foreground">({pct(r.rates.trial)})</span></TableCell>
            <TableCell>{r.paid} <span className="text-muted-foreground">({pct(r.rates.paid)})</span></TableCell>
            <TableCell>{r.active30d}/{r.eligible30d} <span className="text-muted-foreground">({pct(r.rates.active30d)})</span></TableCell>
            <TableCell>{r.activeNow}</TableCell>
            <TableCell>{formatCents(r.revenueCents)}</TableCell>
            <TableCell>{formatCents(r.grossProfit30dCents)}</TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && <TableRow><TableCell colSpan={10} className="text-muted-foreground">No data in this range.</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

async function Funnel({ from, to, by, campaign }: { from: Date; to: Date; by: Search["by"] & string; campaign?: string }) {
  const d = await loadSourceFunnel(from, to, by === "channel" || by === "source" || by === "content" ? by : "campaign", new Date(), campaign);
  const day = (x: Date) => x.toISOString().slice(0, 10);
  return (
    <div className="space-y-6">
      <form className="flex flex-wrap items-end gap-3 text-sm">
        <label className="grid gap-1">From<input className="rounded border bg-background px-2 py-1" type="date" name="from" defaultValue={day(from)} /></label>
        <label className="grid gap-1">To<input className="rounded border bg-background px-2 py-1" type="date" name="to" defaultValue={day(new Date(to.getTime() - 1))} /></label>
        <label className="grid gap-1">Group by
          <select className="rounded border bg-background px-2 py-1" name="by" defaultValue={d.by}>
            <option value="channel">Channel</option><option value="source">utm_source</option><option value="campaign">utm_campaign</option><option value="content">utm_content</option>
          </select>
        </label>
        <label className="grid gap-1">Ads of campaign
          <select className="rounded border bg-background px-2 py-1" name="campaign" defaultValue={d.adCampaignId ?? ""}>
            {d.campaigns.filter((c) => /^\d+$/.test(c.campaignId)).map((c) => <option key={c.campaignId} value={c.campaignId}>{c.campaignName}</option>)}
          </select>
        </label>
        <button className="rounded border px-3 py-1" type="submit">Apply</button>
      </form>
      <Card><CardHeader><CardTitle>By source</CardTitle></CardHeader><CardContent>{d.botVisits > 0 && <p className="mb-2 text-sm text-muted-foreground">Excluded {d.botVisits} visits from Meta ad review (Meta-owned IPs).</p>}<FunnelTable rows={[...d.funnel, d.total]} keyLabel="Source" /></CardContent></Card>
      <Card>
        <CardHeader><CardTitle>Meta campaigns</CardTitle></CardHeader>
        <CardContent>
          {d.spendStatus !== "ok" && <p className="mb-2 text-sm text-muted-foreground">{d.spendStatus === "no_token" ? "No META_ADS_TOKEN / META_AD_ACCOUNT_ID: spend shown as 0." : `Meta insights error: ${d.spendError ?? "unknown"} (spend shown as 0).`}</p>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead><TableHead>Spend</TableHead><TableHead>Clicks</TableHead><TableHead>CPC</TableHead><TableHead>Sign-ups</TableHead><TableHead>Cost/sign-up</TableHead>
                <TableHead>Trials</TableHead><TableHead>Cost/trial</TableHead><TableHead>Paid</TableHead><TableHead>CAC</TableHead><TableHead>GP 30d</TableHead><TableHead>GP30 / spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.campaigns.map((c) => (
                <TableRow key={c.campaignId}>
                  <TableCell className="font-medium">{c.campaignName}</TableCell><TableCell>{formatCents(c.spendCents)}</TableCell><TableCell>{c.clicks}</TableCell><TableCell>{money(c.cpcCents)}</TableCell>
                  <TableCell>{c.signedUp}</TableCell><TableCell>{money(c.costPerSignupCents)}</TableCell><TableCell>{c.trialFinished}</TableCell><TableCell>{money(c.costPerTrialCents)}</TableCell>
                  <TableCell>{c.paid}</TableCell><TableCell>{money(c.cacCents)}</TableCell><TableCell>{formatCents(c.grossProfit30dCents)}</TableCell><TableCell>{c.gp30ToCac === null ? "—" : `${c.gp30ToCac.toFixed(2)}×`}</TableCell>
                </TableRow>
              ))}
              {d.campaigns.length === 0 && <TableRow><TableCell colSpan={12} className="text-muted-foreground">No Meta spend or Meta-attributed sign-ups in this range.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Ads of {d.campaigns.find((c) => c.campaignId === d.adCampaignId)?.campaignName ?? d.adCampaignId ?? "—"}</CardTitle></CardHeader>
        <CardContent>
          {d.adStatus !== "ok" && <p className="mb-2 text-sm text-muted-foreground">{d.adStatus === "no_token" ? "No Meta token: ad spend shown as 0." : `Meta ad insights error: ${d.adError ?? "unknown"}.`}</p>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad</TableHead><TableHead>Spend</TableHead><TableHead>Impr.</TableHead><TableHead>Link clicks</TableHead><TableHead>CTR</TableHead>
                <TableHead>Sign-ups</TableHead><TableHead>Trials done</TableHead><TableHead>Paid</TableHead><TableHead>Cost/sign-up</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.ads.map((a) => (
                <TableRow key={a.adId}>
                  <TableCell className="max-w-xs"><div className="truncate font-medium" title={a.adName}>{a.adName}</div><div className="text-xs text-muted-foreground">{a.adId}</div></TableCell>
                  <TableCell>{formatCents(a.spendCents)}</TableCell><TableCell>{a.impressions}</TableCell><TableCell>{a.linkClicks}</TableCell><TableCell>{a.ctr.toFixed(2)}%</TableCell>
                  <TableCell>{a.signedUp}</TableCell><TableCell>{a.trialFinished}</TableCell><TableCell>{a.paid}</TableCell><TableCell>{money(a.costPerSignupCents)}</TableCell>
                </TableRow>
              ))}
              {d.ads.length === 0 && <TableRow><TableCell colSpan={9} className="text-muted-foreground">No ad data in this range.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Cohorts by sign-up week</CardTitle></CardHeader><CardContent><FunnelTable rows={d.cohorts} keyLabel="Week of" showLanded={false} /></CardContent></Card>
    </div>
  );
}
