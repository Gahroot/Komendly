import type { Metadata } from "next";
import Link from "next/link";
import { HubFormPage } from "@/components/hubs/hub-form-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Turn a customer review into an ad", description: "Paste a real review of your own business and get an ad built around it. Never invented, never edited.", alternates: { canonical: "/reviews-to-ads" } };

export default function Page() {
  return (
    <HubFormPage kind="review">
      <p>We quote the review exactly as you paste it, with the name as it appeared. We never write or alter reviews. Got a batch of Google reviews already connected? See <Link className="underline" href="/free-ads">free ads</Link> or your <Link className="underline" href="/ads/gifts">gifts</Link>.</p>
    </HubFormPage>
  );
}
