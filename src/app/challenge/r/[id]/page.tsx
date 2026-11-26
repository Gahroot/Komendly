import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HubShell } from "@/components/hubs/hub-shell";
import { ShareLink } from "@/components/hubs/share-link";
import { challengeResult } from "@/lib/growth/creative-hubs-server";
import { challengeLabel } from "@/lib/growth/creative-hubs";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const r = await challengeResult((await params).id);
  if (!r) return { title: "Result not found", robots: { index: false } };
  const title = `Website to ad brief in ${challengeLabel(r.ms)}`;
  return { title, description: "The 60-second website-to-ad challenge. Try yours.", robots: { index: false, follow: true }, openGraph: { title, description: "Try the 60-second website-to-ad challenge." }, twitter: { card: "summary", title } };
}

export default async function Page({ params }: P) {
  const id = (await params).id;
  const r = await challengeResult(id);
  if (!r) notFound();
  return (
    <HubShell title={`Website to ad brief in ${challengeLabel(r.ms)}`} lead="That's the time someone took to enter their website and start their free Komendly ads. Can you beat it?">
      <div className="flex flex-wrap gap-3">
        <Link href="/challenge?utm_source=hub&utm_medium=acquire&utm_campaign=challenge_card" className="inline-flex h-12 items-center rounded-xl bg-[var(--studio-gold)] px-6 font-semibold text-[#2a0f10]">Take the challenge</Link>
        <ShareLink url={`/challenge/r/${id}`} text={`Website to ad brief in ${challengeLabel(r.ms)}`} />
      </div>
    </HubShell>
  );
}
