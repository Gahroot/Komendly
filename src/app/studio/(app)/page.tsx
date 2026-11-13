import { StudioHome } from "@/components/studio-chat/studio-home";
import { railData } from "@/lib/studio/page-data";
import { studioAccess } from "@/lib/studio/server";

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ prompt?: string; remix?: string }> }) {
  const { workspace } = await studioAccess();
  const { sessions, account } = await railData(workspace);
  const { prompt, remix } = await searchParams;
  return <StudioHome sessions={sessions} account={account} initialPrompt={prompt?.slice(0, 8000) ?? null} initialRemix={remix?.slice(0, 2000) ?? null} />;
}
