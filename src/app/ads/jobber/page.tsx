import { redirect } from "next/navigation";
import Link from "next/link";
import { getCookieUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdsNav } from "@/components/ads/ads-nav";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { connectPath, jobberEnv, verifyConnectToken } from "@/lib/integrations/jobber/core";
import { getConnection } from "@/lib/integrations/jobber/server";

export const metadata = { title: "Connect Jobber", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** After Jobber's consent screen: pick the Komendly account (sign up / in), then the website for the free ad pack. */
export default async function JobberConnectPage({ searchParams }: { searchParams: Promise<{ c?: string; error?: string }> }) {
  const { c = "", error } = await searchParams;
  const env = jobberEnv();
  const id = env ? verifyConnectToken(c, env.clientSecret) : null;
  const user = id ? await getCookieUser() : null;
  if (id && !user) redirect(`/ads/signup?next=${encodeURIComponent(connectPath(c))}`);
  const conn = id ? await getConnection(prisma, id) : null;
  const workspace = user ? await getOrCreateWorkspace(user) : null;
  const linkedHere = Boolean(conn && workspace && conn.workspaceId === workspace.id);
  const business = conn?.props.accountName ?? "your Jobber account";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn={Boolean(user)} />
      <main className="mx-auto max-w-lg px-4 py-16 sm:py-24">
        {!conn ? (
          <>
            <h1 className="font-display text-3xl font-medium">This link has expired</h1>
            <p className="mt-3 text-muted-foreground">Connect Jobber again and you&apos;ll be right back here.</p>
            <a href="/api/integrations/jobber/authorize" className="mt-6 inline-block rounded-lg bg-[var(--studio-gold)] px-5 py-3 font-medium text-black">Connect Jobber</a>
          </>
        ) : (
          <>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Jobber connected</p>
            <h1 className="mt-2 font-display text-3xl font-medium">{linkedHere ? `${business} is connected` : `Your free ads for ${business}`}</h1>
            <p className="mt-3 text-muted-foreground">
              {linkedHere
                ? "Jobs you close in Jobber now steer the ads Ozzy makes for you each week. Make another pack from your website any time."
                : "Paste your business website. Ozzy reads it and makes your free pack of Facebook and Instagram ads in a few minutes. After that, jobs you close in Jobber turn into fresh ad ideas."}
            </p>
            {error ? <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</p> : null}
            <form method="post" action="/api/integrations/jobber/link" className="mt-6 space-y-3">
              <input type="hidden" name="c" value={c} />
              <label className="block text-sm font-medium" htmlFor="url">Your business website</label>
              <input id="url" name="url" type="text" inputMode="url" required defaultValue={conn.props.website ?? ""} placeholder="yourroofingco.com" className="w-full rounded-lg border border-border bg-background px-4 py-3" />
              <button type="submit" className="w-full rounded-lg bg-[var(--studio-gold)] px-5 py-3 font-medium text-black">{linkedHere ? "Make ads from my website" : "Make my free ads"}</button>
            </form>
            {linkedHere ? <p className="mt-6 text-sm text-muted-foreground"><Link href="/ads/app" className="underline">Go to my ads</Link></p> : null}
          </>
        )}
      </main>
    </div>
  );
}
