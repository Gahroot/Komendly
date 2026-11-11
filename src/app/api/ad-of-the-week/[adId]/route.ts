// Public image of a consented ad (Ad of the week, /ad-examples). See src/lib/ads/feature-assets.ts.
import { servePublicFeatureImage } from "@/lib/ads/feature-assets";

export async function GET(request: Request, { params }: { params: Promise<{ adId: string }> }) {
  const { adId } = await params;
  const ratio = new URL(request.url).searchParams.get("ratio") ?? undefined;
  return servePublicFeatureImage(adId, { ratio, signal: request.signal });
}
