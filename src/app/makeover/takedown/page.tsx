import type { Metadata } from "next";
import { HubFormPage } from "@/components/hubs/hub-form-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Take-down and opt-out request", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const ref = (await searchParams).ref;
  return <HubFormPage kind="takedown" defaults={ref ? { ref: ref.slice(0, 200) } : undefined} />;
}
