import type { Metadata } from "next";
import Link from "next/link";
import { HubFormPage } from "@/components/hubs/hub-form-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Free ad makeover for your website", description: "Enter your own website and get a free ad makeover. Private unless you approve showing it.", alternates: { canonical: "/makeover" } };

export default function Page() {
  return (
    <HubFormPage kind="makeover">
      <p>How it works: you enter your own site, we make ads from it and email you a private link. We only show a makeover publicly if you tick the optional box <em>and</em> approve it, or after you claim it. It is always labelled as a Komendly makeover and has a take-down link.</p>
      <p>Already running an ad? Try <Link className="underline" href="/rescue">ad rescue</Link>. Want to remove something? <Link className="underline" href="/makeover/takedown">Take-down request</Link>.</p>
    </HubFormPage>
  );
}
