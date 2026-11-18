import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GalleryLanding, galleryMetadata } from "@/components/ad-examples/gallery-landing";
import { GALLERY_PAGES, galleryPageFor } from "@/lib/growth/ad-pages";

// /ad-examples/occasion/<slug>: one page per occasion intent (vocabulary). ISR hourly; noindex until it has substance.
export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return GALLERY_PAGES.filter((p) => p.kind === "occasion").map((p) => ({ slug: p.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = galleryPageFor("occasion", (await params).slug);
  return p ? galleryMetadata(p.key) : {};
}

export default async function Page({ params }: Props) {
  const p = galleryPageFor("occasion", (await params).slug);
  if (!p) notFound();
  return <GalleryLanding pageKey={p.key} />;
}
