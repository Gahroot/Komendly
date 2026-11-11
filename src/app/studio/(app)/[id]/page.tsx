import { notFound } from "next/navigation";
import { StudioChat } from "@/components/studio-chat/studio-chat";
import { AdsHttpError } from "@/lib/ads/workspace";
import { railData } from "@/lib/studio/page-data";
import { loadStudioThread, requireStudioSession } from "@/lib/studio/server";

export default async function StudioSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireStudioSession(id).catch((e: unknown) => {
    if (e instanceof AdsHttpError) return null;
    throw e;
  });
  if (!access) notFound();
  const [thread, rail] = await Promise.all([loadStudioThread(access.session, access.workspace), railData(access.workspace)]);
  return <StudioChat key={id} initial={thread} sessions={rail.sessions} />;
}
