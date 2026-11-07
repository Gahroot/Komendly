import { OG_SIZE, ozzyDataUrl, studioOg } from "@/lib/og/studio-og";

export const alt = "Komendly: your website in, ready-to-run ads out";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return studioOg({ headline: "Your website in, ready-to-run ads out", headlineSize: 84, pill: "10 free ads · no card", ozzy: await ozzyDataUrl("classic-happy") });
}
