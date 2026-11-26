import { ResourceToolPage, resourceMetadata } from "@/components/resources/tool-page";

export const revalidate = 3600;
export const metadata = resourceMetadata("marketing-calendar-generator");
export default function Page() {
  return <ResourceToolPage slug="marketing-calendar-generator" />;
}
