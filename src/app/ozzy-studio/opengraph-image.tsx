import { OG_SIZE, ozzyDataUrl, studioOg } from "@/lib/og/studio-og";

export const alt = "Ozzy Studio: make video ads by chatting";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return studioOg({ headline: "Make video ads by chatting with Ozzy", headlineSize: 80, pill: "Ozzy Studio · 1 free video", ozzy: await ozzyDataUrl("creator-focused") });
}
