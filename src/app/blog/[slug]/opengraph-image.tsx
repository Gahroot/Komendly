import { getBlogPosts } from "@/lib/blog";
import { OG_SIZE, ozzyDataUrl, studioOg } from "@/lib/og/studio-og";

export const alt = "Komendly Journal";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = getBlogPosts().find((p) => p.slug === slug)?.title ?? "Komendly Journal";
  return studioOg({ label: "Journal", headline: title, headlineSize: title.length > 60 ? 54 : 66, ozzy: await ozzyDataUrl("creator-focused") });
}
