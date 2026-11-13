import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCookieUser, getSessionToken } from "@/lib/auth";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { TTL, originFromHeaders, signConsent } from "@/lib/oauth/core";
import { checkAuthorizeRequest } from "@/lib/oauth/authorize";
import { fraunces } from "@/components/studio/fonts";
import { StudioPose } from "@/components/studio/studio-pose";
import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect an app to Ozzy", robots: { index: false, follow: false } };

const PARAMS = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "resource", "scope"] as const;

/** Signed, short-lived form token for the Allow/Cancel POST (see /api/oauth/authorize). */
function consentToken(sessionToken: string, payload: Record<string, string>): string {
  return signConsent(sessionToken, payload, Date.now() + TTL.consentSeconds * 1000);
}

type Search = Promise<Record<string, string | string[] | undefined>>;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-10">{children}</main>
    </StudioRoot>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Search }) {
  const raw = await searchParams;
  const get = (k: string) => {
    const v = raw[k];
    return typeof v === "string" ? v : null;
  };
  const origin = originFromHeaders(await headers());
  const check = await checkAuthorizeRequest(get, origin);
  if (check.kind === "fatal") {
    return (
      <Shell>
        <StudioPose form="developer" expression="neutral" size={88} />
        <div className="studio-frame mt-6 w-full rounded-2xl p-6 text-center">
          <h1 className="font-display text-2xl font-medium">We couldn&apos;t connect this app</h1>
          <p className="mt-3 text-sm text-muted-foreground">{check.message}</p>
        </div>
      </Shell>
    );
  }
  if (check.kind === "redirect") redirect(check.url);

  const user = await getCookieUser();
  const sessionToken = await getSessionToken();
  if (!user || !sessionToken) {
    const qs = new URLSearchParams();
    for (const k of PARAMS) {
      const v = get(k);
      if (v !== null) qs.set(k, v);
    }
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${qs.toString()}`)}`);
  }
  const workspace = await getOrCreateWorkspace(user);
  const payload: Record<string, string> = { user_id: user.id };
  for (const k of PARAMS) {
    const v = get(k);
    if (v !== null) payload[k] = v;
  }
  const consent = consentToken(sessionToken, payload);
  const app = check.client.name;

  return (
    <Shell>
      <StudioPose form="developer" expression="happy" size={96} />
      <form method="post" action="/api/oauth/authorize" className="studio-frame mt-6 w-full rounded-2xl p-6">
        <input type="hidden" name="consent" value={consent} />
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">Connect an app</p>
        <h1 className="font-display mt-2 text-balance text-2xl font-medium leading-tight">
          {app} wants to use Ozzy on your Komendly account
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">If you allow it, {app} can:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
          <li>Make videos and ad packs with Ozzy</li>
          <li>Use your plan and credits for that work</li>
          <li>See your videos, ad packs, plan and credits</li>
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          Workspace: <span className="text-foreground">{workspace.name}</span>
          <br />
          Signed in as <span className="text-foreground">{user.email}</span>
        </p>
        <p className="mt-3 text-xs text-muted-foreground">You can disconnect it any time at Dashboard → API.</p>
        <div className="mt-6 flex gap-3">
          <button type="submit" name="decision" value="cancel" className="h-11 flex-1 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button type="submit" name="decision" value="allow" className="spellbar__cta h-11 flex-1 rounded-xl px-4 text-sm font-semibold">
            Allow
          </button>
        </div>
      </form>
    </Shell>
  );
}
