import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { walletView } from "@/lib/hub/summary";
import { HubShell } from "@/components/hub/hub-shell";
import { fraunces } from "@/components/studio/fonts";
import { StudioBackdrop } from "@/components/studio/studio-backdrop";
import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";

export const dynamic = "force-dynamic";

/** The Ozzy hub: every signed-in user gets it. Testimonial creation is gated per page (TestimonialGate). */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const ws = await getOrCreateWorkspace(user);
  const wallet = walletView(user, ws);
  return (
    <StudioRoot className={`${fraunces.variable} studio-app relative isolate min-h-screen`}>
      <StudioBackdrop />
      <HubShell wallet={wallet}>{children}</HubShell>
    </StudioRoot>
  );
}
