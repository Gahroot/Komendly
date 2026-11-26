import type { Metadata } from "next";
import Link from "next/link";
import { HubFormPage } from "@/components/hubs/hub-form-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ad rescue: free critique and improved ad", description: "Send your current Facebook or Instagram ad for a free critique and an improved version. Private.", alternates: { canonical: "/rescue" } };

export default function Page() {
  return (
    <HubFormPage kind="rescue">
      <p>Want a quick score first? The <Link className="underline" href="/tools/meta-ad-check">free Meta Ad Check</Link> grades live ads with the same rubric. Your rescue stays private: we never publish a critique of anyone&apos;s ad.</p>
    </HubFormPage>
  );
}
