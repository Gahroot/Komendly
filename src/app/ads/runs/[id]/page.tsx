import { notFound, redirect } from "next/navigation";
import { AdsNav } from "@/components/ads/ads-nav";
import { RunScreen } from "@/components/ads/run-screen";
import { loadRunView } from "@/lib/ads/run-view";
import { AdsHttpError, requireWorkspaceMember } from "@/lib/ads/workspace";

export const metadata = { title: "Your ads", robots: { index: false, follow: false } };

export default async function AdRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireWorkspaceMember({ runId: id });
  } catch (error) {
    if (error instanceof AdsHttpError && error.status === 401) redirect(`/ads/login?next=${encodeURIComponent(`/ads/runs/${id}`)}`);
    notFound();
  }
  const run = await loadRunView(id);
  if (!run) notFound();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdsNav signedIn />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <RunScreen initial={run} />
      </main>
    </div>
  );
}
