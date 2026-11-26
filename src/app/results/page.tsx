import type { Metadata } from "next";
import { loadPublicCaseStudies } from "@/lib/growth/proof-server";
import { measuredLines, RESULTS_EMPTY, resultsIndexable } from "@/lib/growth/proof";

export const dynamic = "force-dynamic";

const DESCRIPTION = "Measured results from Komendly customers who agreed to share them: ad spend, leads and cost per lead, with dates and method.";

export async function generateMetadata(): Promise<Metadata> {
  const n = (await loadPublicCaseStudies().catch(() => [])).length;
  return { title: "Customer results", description: DESCRIPTION, alternates: { canonical: "/results" }, robots: resultsIndexable(n) ? { index: true, follow: true } : { index: false, follow: false } };
}

const fmt = (iso: string) => new Date(iso).toISOString().slice(0, 10);

export default async function ResultsPage() {
  const studies = await loadPublicCaseStudies().catch(() => []);
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-foreground">
      <h1 className="text-3xl font-semibold">Customer results</h1>
      <p className="mt-3 text-muted-foreground">Only customers who said yes appear here. Every number is measured from their own Meta ad account and lead form. Nothing is estimated, and results differ for every business.</p>
      {studies.length === 0 ? (
        <p className="mt-10 rounded-lg border p-6">{RESULTS_EMPTY}</p>
      ) : (
        <ul className="mt-10 space-y-6">
          {studies.map((s) => (
            <li key={s.workspaceId} className="rounded-lg border p-6">
              <h2 className="text-xl font-semibold">{s.businessName}</h2>
              <p className="text-sm text-muted-foreground">Measured {s.measured.from} to {s.measured.to} · shared with permission on {fmt(s.consentedAt)}</p>
              <ul className="mt-4 list-disc space-y-1 pl-5">{measuredLines(s.measured).map((l) => <li key={l}>{l}</li>)}</ul>
              <p className="mt-4 text-xs text-muted-foreground">Method: {s.method}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
