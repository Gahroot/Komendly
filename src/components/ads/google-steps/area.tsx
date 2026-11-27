"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleApiError, googleApi, type GeoPick } from "@/lib/ads/google/client-api";

const MILES = [5, 10, 15, 25, 50];
const geoKey = (g: GeoPick) => (g.kind === "location" ? `l:${g.id}` : `r:${g.lat},${g.lng},${g.miles}`);
const geoLabel = (g: GeoPick) => (g.kind === "location" ? g.name : `Within ${g.miles} miles of ${g.label}`);

export function AreaStep({
  geo, onGeo, base,
}: {
  geo: GeoPick[];
  onGeo: (g: GeoPick[]) => void;
  /** The business location (from the draft), needed for "within X miles". */
  base: Extract<GeoPick, { kind: "radius" }> | null;
}) {
  const radius = geo.find((g): g is Extract<GeoPick, { kind: "radius" }> => g.kind === "radius") ?? null;
  const [mode, setMode] = useState<"places" | "radius">(radius ? "radius" : "places");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoPick[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  // Cities picked before switching to "around my business", restored when switching back.
  const savedPlaces = useRef<GeoPick[]>(geo.filter((g) => g.kind === "location"));

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults(null); setError(null); return; }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await googleApi.geoSearch(query);
        if (n === seq.current) { setResults(r.results); setError(null); }
      } catch (e) {
        if (n === seq.current) setError(e instanceof GoogleApiError ? e.message : "We couldn't search places right now.");
      } finally {
        if (n === seq.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const places = geo.filter((g) => g.kind === "location");
  const add = (g: GeoPick) => {
    if (!geo.some((x) => geoKey(x) === geoKey(g))) onGeo([...geo.filter((x) => x.kind === "location"), g]);
    setQ(""); setResults(null);
  };
  const pickMode = (m: "places" | "radius") => {
    setMode(m);
    if (m === "radius" && base) { if (places.length) savedPlaces.current = places; onGeo([radius ?? base]); }
    if (m === "places") onGeo(places.length ? places : savedPlaces.current);
  };

  return (
    <div className="space-y-4 text-sm">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1.5 font-medium">Where are your customers?</legend>
        <label className={`flex cursor-pointer gap-2 rounded-md border px-3 py-2 ${mode === "places" ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}>
          <input type="radio" name="google-area" className="mt-0.5 accent-primary" checked={mode === "places"} onChange={() => pickMode("places")} />
          <span><span className="block font-medium">Cities or areas</span><span className="block text-xs text-muted-foreground">Towns, zip codes, counties or states.</span></span>
        </label>
        {base && (
          <label className={`flex cursor-pointer gap-2 rounded-md border px-3 py-2 ${mode === "radius" ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}>
            <input type="radio" name="google-area" className="mt-0.5 accent-primary" checked={mode === "radius"} onChange={() => pickMode("radius")} />
            <span><span className="block font-medium">Around my business</span>
              <span className="block text-xs text-muted-foreground">Within a distance of {base.label}.</span></span>
          </label>
        )}
      </fieldset>

      {mode === "places" ? (
        <div className="space-y-2">
          <ul className="flex min-h-7 flex-wrap gap-1.5" aria-label="Chosen areas">
            {places.length === 0 && <li className="text-muted-foreground">No areas yet. Search below.</li>}
            {places.map((g) => (
              <li key={geoKey(g)} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-secondary-foreground">
                <MapPin className="size-3.5" aria-hidden /> {geoLabel(g)}
                <button type="button" className="rounded-full hover:text-destructive" onClick={() => onGeo(geo.filter((x) => geoKey(x) !== geoKey(g)))} aria-label={`Remove ${geoLabel(g)}`}>
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <Label htmlFor="google-geo-search" className="sr-only">Search a city or area</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="google-geo-search" className="pl-8" placeholder="Search a city, zip code or area" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" aria-controls="google-geo-results" />
            {searching && <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Searching" />}
          </div>
          {error && <p className="text-destructive" role="alert">{error} Try a different spelling.</p>}
          {results && (
            <ul id="google-geo-results" className="max-h-48 overflow-y-auto rounded-md border border-border" aria-live="polite">
              {results.filter((g) => !geo.some((x) => geoKey(x) === geoKey(g))).length === 0 && <li className="px-3 py-2 text-muted-foreground">No places found. Try a nearby city.</li>}
              {results.filter((g) => !geo.some((x) => geoKey(x) === geoKey(g))).map((g) => (
                <li key={geoKey(g)}>
                  <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none" onClick={() => add(g)}>
                    <span>{geoLabel(g)}</span>
                    {g.kind === "location" && <span className="text-xs text-muted-foreground">{g.type} · {g.countryCode}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : base && (
        <div className="space-y-1.5">
          <p id="google-miles-label" className="font-medium">How far do you travel or do customers come from?</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby="google-miles-label">
            {MILES.map((m) => {
              const on = (radius?.miles ?? base.miles) === m;
              return (
                <button key={m} type="button" role="radio" aria-checked={on} onClick={() => onGeo([{ ...(radius ?? base), miles: m }])}
                  className={`rounded-full border px-3 py-1 ${on ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-accent"}`}>
                  {m} miles
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Google shows your ads to people in these places.</p>
    </div>
  );
}
