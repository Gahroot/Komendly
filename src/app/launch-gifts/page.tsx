import type { Metadata } from "next";
import { HubFormPage } from "@/components/hubs/hub-form-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Startup launch gift: free launch-ready ads", description: "Launching a product or business? Get a free ad pack made from your website.", alternates: { canonical: "/launch-gifts" } };

export default function Page() {
  return <HubFormPage kind="launch"><p>The launch gift is the free pack (10 ads, no card). We email you when it&apos;s ready. Nothing is promised about results, and nothing is published.</p></HubFormPage>;
}
