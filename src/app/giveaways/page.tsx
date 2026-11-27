import type { Metadata } from "next";
import { HubFormPage } from "@/components/hubs/hub-form-page";
import { HubShell } from "@/components/hubs/hub-shell";
import { currentGiveaway } from "@/lib/growth/creative-hubs-server";

export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  const open = currentGiveaway() !== null;
  return { title: "Komendly giveaways", description: "Enter the current Komendly giveaway. One entry per email.", alternates: { canonical: "/giveaways" }, robots: open ? undefined : { index: false, follow: true } };
}

export default function Page() {
  const g = currentGiveaway();
  if (!g) return <HubShell title="Komendly giveaways" lead="No giveaway is running right now. Check back soon." />;
  return (
    <HubFormPage kind="giveaway" titleOverride={`Giveaway: ${g.prize}`}>
      <h2 className="font-medium text-foreground">Rules</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Prize: {g.prize}. Giveaway {g.key} (UTC month). No purchase necessary; buying does not improve your chances.</li>
        <li>One entry per email. The winner is drawn at random from valid entries and contacted by email only.</li>
        <li>Entries are not shared or sold. Optional tips emails carry an unsubscribe link.</li>
      </ul>
    </HubFormPage>
  );
}
