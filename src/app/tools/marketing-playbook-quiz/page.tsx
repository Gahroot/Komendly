import { ResourceToolPage, resourceMetadata } from "@/components/resources/tool-page";

export const revalidate = 3600;
export const metadata = resourceMetadata("marketing-playbook-quiz");
export default function Page() {
  return <ResourceToolPage slug="marketing-playbook-quiz" />;
}
