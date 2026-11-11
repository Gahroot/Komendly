import { StudioHome } from "@/components/studio-chat/studio-home";
import { railData } from "@/lib/studio/page-data";
import { studioAccess } from "@/lib/studio/server";

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ prompt?: string }> }) {
  const { workspace } = await studioAccess();
  const { sessions, account } = await railData(workspace);
  const { prompt } = await searchParams;
  return <StudioHome sessions={sessions} account={account} initialPrompt={prompt?.slice(0, 8000) ?? null} />;
}
