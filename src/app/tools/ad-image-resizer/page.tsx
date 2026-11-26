import { ResourceToolPage, resourceMetadata } from "@/components/resources/tool-page";

export const revalidate = 3600;
export const metadata = resourceMetadata("ad-image-resizer");
export default function Page() {
  return <ResourceToolPage slug="ad-image-resizer" />;
}
