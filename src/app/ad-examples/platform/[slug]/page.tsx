import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GalleryLanding, galleryMetadata } from "@/components/ad-examples/gallery-landing";
import { GALLERY_PAGES, galleryPageFor } from "@/lib/growth/ad-pages";

// /ad-examples/platform/<slug>: one page per platform intent (vocabulary). ISR hourly; noindex until it has substance.
export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return GALLERY_PAGES.filter((p) => p.kind === "platform").map((p) => ({ slug: p.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = galleryPageFor("platform", (await params).slug);
  return p ? galleryMetadata(p.key) : {};
}

export default async function Page({ params }: Props) {
  const p = galleryPageFor("platform", (await params).slug);
  if (!p) notFound();
  return <GalleryLanding pageKey={p.key} />;
}
