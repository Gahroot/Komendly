import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GalleryLanding, galleryMetadata } from "@/components/ad-examples/gallery-landing";
import { GALLERY_PAGES, comboForIndustry } from "@/lib/growth/ad-pages";

// /ad-examples/<industry>/facebook: "facebook ads for <industry>" only for the industries in FACEBOOK_COMBOS. ISR hourly.
export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return GALLERY_PAGES.filter((p) => p.kind === "combo" && p.comboPlatform === "facebook").map((p) => ({ industry: p.industry! }));
}

type Props = { params: Promise<{ industry: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = comboForIndustry((await params).industry);
  return p ? galleryMetadata(p.key) : {};
}

export default async function Page({ params }: Props) {
  const p = comboForIndustry((await params).industry);
  if (!p) notFound();
  return <GalleryLanding pageKey={p.key} />;
}
