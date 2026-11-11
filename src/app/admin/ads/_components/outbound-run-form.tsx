"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Queue an outbound lead run (niche + cities + count); the engine finds leads and makes their hook ads. */
export function OutboundRunForm() {
  const router = useRouter();
  const [f, setF] = useState({ niche: "roofers", cities: "", count: "10" });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const cities = f.cities.split(/[;\n]/).map((c) => c.trim()).filter(Boolean);
      const res = await fetch("/api/admin/ads/outbound", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "run", niche: f.niche, cities, count: Number(f.count) }) });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error ?? "Couldn't queue the run");
      else {
        toast.success("Lead run queued: the engine picks it up within a minute");
        setF({ ...f, cities: "" });
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="grid gap-1.5"><Label htmlFor="ob-niche">Niche</Label><Input id="ob-niche" required value={f.niche} onChange={set("niche")} /></div>
      <div className="grid gap-1.5"><Label htmlFor="ob-cities">Cities (separate with ;)</Label><Input id="ob-cities" required value={f.cities} onChange={set("cities")} placeholder="Denver, CO; Austin, TX" /></div>
      <div className="grid gap-1.5"><Label htmlFor="ob-count">How many leads</Label><Input id="ob-count" type="number" min={1} max={100} required value={f.count} onChange={set("count")} /></div>
      <Button type="submit" disabled={busy}>Find leads + make ads</Button>
    </form>
  );
}
