"use client";

import { useMemo, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PresenterGender } from "@/lib/testimonial-draft";
import { ActorThumb } from "./actor-thumb";
import { sortActors, type StudioActor } from "./actors";

type FilterKey = "ageRange" | "setting" | "tag" | "industry";

function distinct(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
}

function pretty(v: string): string {
  if (/^\d+\s*[-_]\s*\d+$/.test(v)) return v.replace(/\s*[-_]\s*/, "–");
  return v.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const GENDERS: { id: PresenterGender; label: string }[] = [
  { id: "any", label: "Anyone" },
  { id: "female", label: "Women" },
  { id: "male", label: "Men" },
];

/** Filterable presenter grid. Recommended presenters (from the server) sort first with a badge. */
export function ActorGrid({
  actors,
  selectedId,
  onSelect,
  gender,
  onGender,
}: {
  actors: StudioActor[];
  selectedId: string | undefined;
  onSelect: (a: StudioActor) => void;
  gender: PresenterGender;
  onGender: (g: PresenterGender) => void;
}) {
  const [filters, setFilters] = useState<Record<FilterKey, string>>({ ageRange: "", setting: "", tag: "", industry: "" });
  const options = useMemo(
    () => ({
      ageRange: distinct(actors.map((a) => a.ageRange)),
      setting: distinct(actors.map((a) => a.setting)),
      tag: distinct(actors.flatMap((a) => a.tags ?? [])),
      industry: distinct(actors.flatMap((a) => a.industries ?? [])),
    }),
    [actors],
  );
  const shown = useMemo(
    () =>
      sortActors(actors).filter(
        (a) =>
          (gender === "any" || a.gender === gender) &&
          (!filters.ageRange || a.ageRange === filters.ageRange) &&
          (!filters.setting || a.setting === filters.setting) &&
          (!filters.tag || (a.tags ?? []).includes(filters.tag)) &&
          (!filters.industry || (a.industries ?? []).includes(filters.industry)),
      ),
    [actors, gender, filters],
  );
  const hasRecommended = actors.some((a) => a.recommended);
  const selects: { key: FilterKey; label: string }[] = [
    { key: "industry", label: "Industry" },
    { key: "ageRange", label: "Age" },
    { key: "setting", label: "Setting" },
    { key: "tag", label: "Vibe" },
  ];
  const active = Object.values(filters).some(Boolean) || gender !== "any";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Presenter gender" className="flex gap-1.5">
          {GENDERS.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={gender === g.id} onClick={() => onGender(g.id)} className="spell-chip h-10 rounded-full px-4 text-sm">
              {g.label}
            </button>
          ))}
        </div>
        {selects.map(({ key, label }) =>
          options[key].length > 1 ? (
            <label key={key} className="relative">
              <span className="sr-only">{label}</span>
              <select
                value={filters[key]}
                onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
                className={cn("spell-chip h-10 appearance-none rounded-full bg-transparent pl-4 pr-8 text-sm", filters[key] && "text-foreground border-[var(--studio-gold)]")}
              >
                <option value="">{label}: any</option>
                {options[key].map((o) => (
                  <option key={o} value={o}>{pretty(o)}</option>
                ))}
              </select>
              <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">▾</span>
            </label>
          ) : null,
        )}
        {active ? (
          <button type="button" onClick={() => { setFilters({ ageRange: "", setting: "", tag: "", industry: "" }); onGender("any"); }} className="h-10 px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Clear
          </button>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {shown.length} presenter{shown.length === 1 ? "" : "s"}{hasRecommended ? " · best matches for this review first" : ""}
      </p>
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No presenters match those filters.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((a) => {
            const selected = a.id === selectedId;
            const meta = [a.ageRange, a.occupation ?? a.setting].filter(Boolean).map((m) => pretty(m as string)).join(" · ");
            return (
              <li key={a.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(a)}
                  className={cn(
                    "group relative block w-full overflow-hidden rounded-2xl border bg-[oklch(0.2_0.07_295/0.6)] text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--studio-gold)]",
                    selected ? "border-[var(--studio-gold)] shadow-[0_0_40px_-12px_#ffcf4a99]" : "border-border hover:border-[oklch(0.88_0.08_70/0.35)]",
                  )}
                >
                  <ActorThumb actor={a} className="aspect-[3/4] w-full" />
                  {a.recommended ? (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--studio-gold)] px-2 py-0.5 text-[11px] font-semibold text-[#2a0f10]">
                      <Sparkles aria-hidden className="size-3" /> Recommended for this review
                    </span>
                  ) : null}
                  {selected ? (
                    <span className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-[var(--studio-gold)] text-[#2a0f10]">
                      <Check aria-hidden className="size-4" />
                      <span className="sr-only">Selected</span>
                    </span>
                  ) : null}
                  <span className="block p-3">
                    <span className="block truncate font-medium">{a.name}</span>
                    {meta ? <span className="block truncate text-xs text-muted-foreground">{meta}</span> : null}
                    {a.accent ? <span className="block truncate text-xs text-muted-foreground">{a.accent} accent</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
