import type { Metadata } from "next";
import { HubFormPage } from "@/components/hubs/hub-form-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nonprofit creative program", description: "Free ad pack for registered US nonprofits, verified with a public EIN lookup and a domain check.", alternates: { canonical: "/nonprofits" } };

export default function Page() {
  return (
    <HubFormPage kind="nonprofit">
      <h2 className="font-medium text-foreground">Terms</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Open to US organizations with a public EIN (501(c) status checked on the public ProPublica / IRS listings). No documents to upload.</li>
        <li>Your email must be on your organization&apos;s website domain; webmail addresses can&apos;t be auto-verified.</li>
        <li>The free pack is Komendly&apos;s free pack (10 ads). One per organization. We may decline or end it for misuse.</li>
        <li>We don&apos;t promise donations, leads or results, and we don&apos;t publish anything about you without your OK.</li>
      </ul>
    </HubFormPage>
  );
}
