import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdWatchOptin } from "@/components/growth/ad-watch-optin";
import { ShareLink } from "@/components/hubs/share-link";
import { AutoRefresh } from "@/components/tools/auto-refresh";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { getCookieUser } from "@/lib/auth";
import { FATIGUE_DAYS, adWatchPagesFromReport, cleanTrade, gateReport, type AdCheckPublicReport } from "@/lib/growth/ad-check";
import { adWatchEnabled } from "@/lib/growth/ad-watch-server";
import { adCheckByToken } from "@/lib/growth/ad-check-server";
import { withSystemUtm } from "@/lib/growth/systems";
import { SITE_URL } from "@/lib/site";
import "@/components/studio/studio.css";

// Private Meta Ad Check report (token link; noindex + no-store in next.config.ts, disallowed in robots via crawl.ts).
// Signed-out visitors see the score card; the ad list and rival names unlock with a normal sign-up (the email gate).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your Meta Ad Check", robots: { index: false, follow: false } };

interface PageProps { params: Promise<{ token: string }> }

const relUtm = (path: string, content: string) => {
  const u = new URL(withSystemUtm(`${SITE_URL}${path}`, "ad_check", { campaign: "meta-ad-check", content }));
  return `${u.pathname}${u.search}`;
};

export default async function AdCheckReportPage({ params }: PageProps) {
  const { token } = await params;
  const s = await adCheckByToken(token);
  if (!s) notFound();
  const user = s.status === "done" && s.result?.ok ? await getCookieUser().catch(() => null) : null;
  const r = s.status === "done" && s.result?.ok ? gateReport(s.result.report, Boolean(user)) : null;
  const watchOn = r ? await adWatchEnabled().catch(() => false) : false;
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <StudioNav signedIn={Boolean(user)} />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-14">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Meta Ad Check · by Komendly</p>
        {s.status !== "done" ? (
          <>
            <AutoRefresh />
            <h1 className="font-display mt-4 text-3xl font-medium sm:text-4xl">Reading the Meta Ad Library…</h1>
            <p className="mt-3 text-muted-foreground">We are scanning the live ads for <strong>{s.input}</strong> and a few local advertisers in the same trade. This page updates by itself.</p>
          </>
        ) : !r ? (
          <NoReport input={s.input} reason={s.result && !s.result.ok ? s.result.reason : "unavailable"} />
        ) : (
          <>
            <Report r={r} token={token} />
            <div className="mt-6"><ShareLink url="/tools/meta-ad-check" text="Check your Meta ads with Komendly's free Ad Check" label="Share the free ad check" /></div>
            {watchOn && (
              <section className="mt-10" aria-label="Competitor ad watch">
                <AdWatchOptin
                  source="meta_ad_check"
                  defaultEmail={user?.email ?? ""}
                  defaultTrade={cleanTrade(r.trade) ?? ""}
                  defaultPages={adWatchPagesFromReport(r)}
                  title="Get an email when these Pages launch new ads"
                  description="Every Monday, Komendly emails you the new Facebook and Instagram ads the Pages below launched (up to 5), each with a one-tap &quot;Make my version&quot;. Weeks with nothing new are skipped."
                />
              </section>
            )}
          </>
        )}
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}

function NoReport({ input, reason }: { input: string; reason: string }) {
  return (
    <>
      <h1 className="font-display mt-4 text-3xl font-medium sm:text-4xl">{reason === "not_found" ? "No live Meta ads found" : "We couldn't finish this check"}</h1>
      <p className="mt-3 text-muted-foreground">
        {reason === "not_found"
          ? <>The US Meta Ad Library shows no active ads we could match to <strong>{input}</strong>. If you do run ads, try your Facebook Page link (facebook.com/yourpage) instead.</>
          : <>The Meta Ad Library didn&apos;t answer for <strong>{input}</strong>. Please try again in a few minutes.</>}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/tools/meta-ad-check" className="inline-flex h-12 items-center rounded-xl border border-border px-6">Check another Page</Link>
        <Link href={relUtm("/free-ads", reason === "not_found" ? "no_ads" : "error")} className="inline-flex h-12 items-center rounded-xl bg-[var(--studio-gold)] px-6 font-semibold text-[#2a0f10]">Get 10 free ads from your website</Link>
      </div>
    </>
  );
}

const dateFmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function Report({ r, token }: { r: AdCheckPublicReport; token: string }) {
  const site = r.website ? `?url=${encodeURIComponent(r.website)}&` : "?";
  const replace = relUtm(`/free-ads${site.slice(0, -1)}`, "report");
  const signup = `/ads/signup?next=${encodeURIComponent(`/ad-check/${token}`)}`;
  const formats = (["image", "video", "carousel", "unknown"] as const).filter((f) => r.formatMix[f] > 0);
  return (
    <>
      <h1 className="font-display mt-4 text-3xl font-medium sm:text-4xl">{r.pageName || "Your Page"}: {r.score}/100</h1>
      <p className="mt-2 text-sm text-muted-foreground">From the public <a href={r.adLibraryUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">Meta Ad Library</a> (active ads in the US), scanned {dateFmt(r.scannedAt.slice(0, 10))}. This report is private to its link.</p>
      {r.summary?.length ? <div className="mt-5 space-y-2 rounded-xl border border-border p-5 text-[15px]">{r.summary.map((l) => <p key={l}>{l}</p>)}</div> : null}

      <dl className="mt-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Live ads" value={String(r.liveCount)} />
        <Stat label="Oldest live ad" value={r.oldestDays === null ? "–" : `${r.oldestDays} days`} />
        <Stat label="Formats" value={formats.length ? formats.map((f) => `${r.formatMix[f]} ${f}`).join(" · ") : "–"} />
        <Stat label={`Running > ${FATIGUE_DAYS} days`} value={String(r.fatigued.length)} warn={r.fatigued.length > 0} />
      </dl>

      <section className="mt-8" aria-labelledby="checks-title">
        <h2 id="checks-title" className="font-display text-2xl font-medium">Score breakdown</h2>
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {r.checks.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-4 px-5 py-3">
              <div><p className="font-medium">{c.pass ? "✓" : "✗"} {c.label}</p><p className="text-sm text-muted-foreground">{c.fact}</p></div>
              <span className="shrink-0 font-mono">{c.points}/{c.max}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Rubric: <Link href="/tools/meta-ad-check#rubric-title" className="underline">how the score works</Link>. A long-running ad is flagged as possibly tired; the Ad Library doesn&apos;t show how it performs.</p>
      </section>

      {r.rivals.length > 0 && (
        <section className="mt-8" aria-labelledby="rivals-title">
          <h2 id="rivals-title" className="font-display text-2xl font-medium">Local advertisers{r.trade ? ` (${r.trade}${r.state ? `, ${r.state}` : ""})` : ""}</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Business</th><th className="px-4 py-2 font-medium">Live ads</th><th className="px-4 py-2 font-medium">Longest-running ad</th></tr></thead>
              <tbody>
                <tr className="border-t border-border"><td className="px-4 py-2 font-medium">You</td><td className="px-4 py-2">{r.liveCount}</td><td className="px-4 py-2">{r.oldestDays === null ? "–" : `${r.oldestDays} days`}</td></tr>
                {r.rivals.map((x, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-4 py-2">{x.pageName && x.adLibraryUrl ? <a href={x.adLibraryUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">{x.pageName}</a> : `Local advertiser ${i + 1}`}</td>
                    <td className="px-4 py-2">{x.liveCount}</td>
                    <td className="px-4 py-2">{x.longestRunDays === null ? "–" : `${x.longestRunDays} days`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.gated && <p className="mt-2 text-xs text-muted-foreground"><Link href={signup} className="underline">Sign up free</Link> to see who they are and their ads in the Ad Library.</p>}
        </section>
      )}

      <section className="mt-10 rounded-2xl border border-[var(--studio-gold)]/40 p-6 text-center">
        <h2 className="font-display text-2xl font-medium">{r.fatigued.length ? "Replace your tired ads" : "Add fresh ads to the mix"}</h2>
        <p className="mt-2 text-muted-foreground">Ozzy reads your website and makes 3 new ads for free. With the Ozzy Ad Department ($97 the first month, then $197/month, cancel anytime) you get fresh ads every week and a coach that tells you what&apos;s working; you post them yourself.</p>
        <Link href={replace} className="mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-[var(--studio-gold)] px-6 font-semibold text-[#2a0f10]">Get 3 replacement ads</Link>
      </section>

      <section className="mt-10" aria-labelledby="ads-title">
        <h2 id="ads-title" className="font-display text-2xl font-medium">Your live ads</h2>
        {r.gated ? (
          <p className="mt-3 text-muted-foreground"><Link href={signup} className="text-[var(--studio-gold)] underline">Sign up free with your email</Link> to see every live ad with its start date, text and Ad Library link.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {r.ads.map((a) => (
              <li key={a.adArchiveId} className="rounded-xl border border-border p-4">
                <p className="text-sm text-muted-foreground">{a.format} · started {dateFmt(a.startedAt)} · {a.runDays} days{a.runDays > FATIGUE_DAYS ? " · possibly tired" : ""}</p>
                {a.headline && <p className="mt-1 font-medium">{a.headline}</p>}
                {a.body && <p className="mt-1 line-clamp-3 text-sm">{a.body}</p>}
                <a href={a.snapshotUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block text-sm text-[var(--studio-gold)] underline">View in Ad Library</a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mt-10 text-xs text-muted-foreground">Meta Ad Check is a free tool by Komendly and is not affiliated with or endorsed by Meta. Only public Ad Library data is used.</p>
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold ${warn ? "text-amber-300" : ""}`}>{value}</dd>
    </div>
  );
}
