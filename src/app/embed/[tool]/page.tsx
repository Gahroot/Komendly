import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolRunner } from "@/components/tools/tool-runner";
import { ToolBody } from "@/components/resources/tool-page";
import { EMBEDDABLE, EMBED_EXISTING, getResource, organicCtaHref, resourcePath } from "@/lib/growth/organic/registry";
import { getFreeTool } from "@/lib/growth/free-tools";
import { withSystemUtm } from "@/lib/growth/systems";
import { SITE_URL } from "@/lib/site";

// Iframe-able tool (framing allowed for /embed/* only; see next.config.ts). Not indexed: canonical points at the full tool page.
export const revalidate = 3600;
export const dynamicParams = false;
const all = () => [...EMBEDDABLE, ...EMBED_EXISTING] as string[];
export function generateStaticParams() { return all().map((tool) => ({ tool })); }

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }): Promise<Metadata> {
  const { tool } = await params;
  return { title: getResource(tool)?.name ?? getFreeTool(tool)?.name ?? "Free tool", alternates: { canonical: resourcePath(tool) }, robots: { index: false, follow: true } };
}

export default async function EmbedPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  if (!all().includes(tool)) notFound();
  const name = getResource(tool)?.name ?? getFreeTool(tool)?.name ?? "Free tool";
  const full = withSystemUtm(`${SITE_URL}${resourcePath(tool)}`, "free_tools", { campaign: tool, content: "embed", medium: "embed" });
  return (
    <main className="mx-auto max-w-2xl p-4 text-foreground">
      <h1 className="font-display mb-4 text-2xl font-medium">{name}</h1>
      {(EMBED_EXISTING as readonly string[]).includes(tool) ? <ToolRunner slug={tool as never} /> : <ToolBody slug={tool} />}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        <a href={full} target="_blank" rel="noopener">{name} by Komendly</a> · <a href={`${SITE_URL}${organicCtaHref(tool, "embed")}`} target="_blank" rel="noopener">Get 10 free ads from your website</a>
      </p>
    </main>
  );
}
