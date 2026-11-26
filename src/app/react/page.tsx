import type { Metadata } from "next";
import { HubFormPage } from "@/components/hubs/hub-form-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Share your reaction", robots: { index: false, follow: false } };

export default function Page() {
  return <HubFormPage kind="reaction"><p>Your consent choice and the time you made it are stored with your words. Without the publish box ticked, we only read it. To remove one later, use the <a className="underline" href="/makeover/takedown">take-down form</a>.</p></HubFormPage>;
}
