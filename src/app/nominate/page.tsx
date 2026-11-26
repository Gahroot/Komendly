import type { Metadata } from "next";
import { HubFormPage } from "@/components/hubs/hub-form-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nominate a business for free ads", description: "Nominate a business you love. We send it one honest note from Komendly, with a one-click opt-out.", alternates: { canonical: "/nominate" } };

export default async function Page({ searchParams }: { searchParams: Promise<{ optout?: string }> }) {
  const out = (await searchParams).optout;
  return (
    <HubFormPage kind="nominate">
      {out && <p role="status" className="rounded-xl border border-border p-4 font-medium text-foreground">You&apos;re opted out. We won&apos;t contact that address again.</p>}
      <p>Rules: one email per business, ever, from Komendly (never from the nominator). We only use a public business contact address, we don&apos;t publish anything about nominees, and an opt-out is permanent.</p>
    </HubFormPage>
  );
}
