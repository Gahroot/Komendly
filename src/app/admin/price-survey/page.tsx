"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import type { VanWestendorpResult } from "@/lib/price-survey";
import { AdminEmpty } from "../_components/admin-empty";

type Data = VanWestendorpResult & { subject: string; total: number };
type Segment = "all" | "visitors" | "customers";

const CURVES = [
  { key: "tooCheap", label: "Too cheap", color: "var(--chart-2)" },
  { key: "cheap", label: "Bargain", color: "var(--chart-3)" },
  { key: "expensive", label: "Expensive", color: "var(--chart-4)" },
  { key: "tooExpensive", label: "Too expensive", color: "var(--chart-5)" },
] as const;

const POINTS = [
  { key: "pmc", label: "PMC", hint: "Point of marginal cheapness (lower bound)" },
  { key: "opp", label: "OPP", hint: "Optimal price point" },
  { key: "ipp", label: "IPP", hint: "Indifference price point" },
  { key: "pme", label: "PME", hint: "Point of marginal expensiveness (upper bound)" },
] as const;

const usd = (v: number | null) => (v === null ? "–" : `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);

export default function PriceSurveyAdminPage() {
  const [segment, setSegment] = useState<Segment>("all");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/admin/price-survey?segment=${segment}`, { signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Data>) : Promise.reject(new Error("Failed to load"))))
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => ac.abort();
  }, [segment]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Testimonials"
        title="Price sensitivity (Van Westendorp)"
        description={data ? `“${data.subject}” · ${data.n} valid of ${data.total} responses` : "Loading…"}
        actions={
          <div className="flex gap-1 rounded-lg border border-border p-1" role="radiogroup" aria-label="Segment">
            {(["all", "visitors", "customers"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={segment === s} onClick={() => setSegment(s)} className={`h-8 rounded-md px-3 text-sm capitalize ${segment === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
                {s}
              </button>
            ))}
          </div>
        }
      />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {POINTS.map((p) => (
          <Card key={p.key}>
            <CardHeader className="pb-2">
              <CardDescription>{p.hint}</CardDescription>
              <CardTitle className="text-sm font-medium text-muted-foreground">{p.label}</CardTitle>
            </CardHeader>
            <CardContent><p className="text-3xl font-semibold tabular-nums">{data ? usd(data[p.key]) : "…"}</p></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Cumulative curves</CardTitle>
          <CardDescription>Share of respondents at each monthly price. Acceptable range = PMC to PME.</CardDescription>
        </CardHeader>
        <CardContent>
          {data && data.points.length > 0 ? (
            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.points} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="price" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => `$${v}`} stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis domain={[0, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip formatter={(v) => `${Math.round(Number(v) * 100)}%`} labelFormatter={(v) => `$${v}`} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  {CURVES.map((c) => (
                    <Line key={c.key} type="stepAfter" dataKey={c.key} name={c.label} stroke={c.color} strokeWidth={2} dot={false} isAnimationActive={false} />
                  ))}
                  {POINTS.map((p) => (data[p.key] !== null ? <ReferenceLine key={p.key} x={data[p.key] as number} stroke="var(--chart-1)" strokeDasharray="4 4" label={{ value: p.label, position: "top", fill: "var(--foreground)", fontSize: 11 }} /> : null))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-6"><AdminEmpty>No survey responses yet. Check back soon.</AdminEmpty></div>
          )}
          <ul className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
            {CURVES.map((c) => (
              <li key={c.key} className="flex items-center gap-2"><span aria-hidden className="h-0.5 w-5" style={{ background: c.color }} />{c.label}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
