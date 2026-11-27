"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GoogleKeyword, GoogleSearchText } from "@/lib/ads/google/client-api";
import { DESCRIPTIONS_MIN, HEADLINES_MIN, MATCH_LABEL, addKeyword, adTextLength, cleanKeyword, displayUrl, hasEmoji, type TextLimits } from "./logic";

function Counter({ id, value, max }: { id: string; value: string; max: number }) {
  const n = adTextLength(value);
  const over = n > max;
  return (
    <span id={id} className={`shrink-0 text-xs tabular-nums ${over ? "font-medium text-destructive" : "text-muted-foreground"}`} aria-live={over ? "polite" : "off"}>
      {n}/{max}{over && <span className="sr-only"> Too long</span>}
    </span>
  );
}

function TextRow({ label, value, max, onChange, onRemove, multiline, removeLabel }: {
  label: string; value: string; max: number; onChange: (v: string) => void; onRemove?: () => void; multiline?: boolean; removeLabel: string;
}) {
  const id = useId();
  const over = adTextLength(value) > max || hasEmoji(value);
  const props = { id, value, "aria-label": label, "aria-invalid": over, "aria-describedby": `${id}-n`, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  return (
    <li className="flex items-start gap-2">
      {multiline ? <Textarea {...props} rows={2} className="min-h-0 flex-1 resize-none" /> : <Input {...props} className="flex-1" />}
      <span className="flex h-9 w-14 items-center justify-end"><Counter id={`${id}-n`} value={value} max={max} /></span>
      <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" onClick={onRemove} disabled={!onRemove} aria-label={removeLabel}><X /></Button>
    </li>
  );
}

export function GooglePreview({ businessName, finalUrl, search }: { businessName: string; finalUrl: string; search: GoogleSearchText }) {
  const heads = search.headlines.map((h) => h.trim()).filter(Boolean).slice(0, 3);
  const desc = search.descriptions.map((d) => d.trim()).filter(Boolean).slice(0, 2).join(" ");
  return (
    <figure className="rounded-lg border border-border bg-white p-4 font-[arial,sans-serif] text-[#202124] shadow-sm" aria-label="Preview of your ad on Google">
      <div className="flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#f1f3f4] text-xs font-bold text-[#5f6368]">{(businessName || "?").slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 leading-tight">
          <span className="block text-[11px] font-bold">Sponsored</span>
          <span className="block truncate text-sm">{businessName}</span>
          <span className="block truncate text-xs text-[#4d5156]">{displayUrl(finalUrl, search.path1, search.path2)}</span>
        </span>
      </div>
      <p className="mt-1.5 break-words text-lg leading-snug text-[#1a0dab]">{heads.join(" | ") || "Your headline"}</p>
      <p className="mt-1 break-words text-sm leading-snug text-[#4d5156]">{desc || "Your description"}</p>
      <figcaption className="sr-only">Google mixes your headlines and descriptions, so the real ad may look a bit different.</figcaption>
    </figure>
  );
}

export function TextAdStep({
  businessName, search, onSearch, keywords, onKeywords, finalUrl, onFinalUrl, limits, blockers,
}: {
  businessName: string;
  search: GoogleSearchText;
  onSearch: (s: GoogleSearchText) => void;
  keywords: GoogleKeyword[];
  onKeywords: (k: GoogleKeyword[]) => void;
  finalUrl: string;
  onFinalUrl: (v: string) => void;
  limits: TextLimits;
  blockers: string[];
}) {
  const [kw, setKw] = useState("");
  const setList = (key: "headlines" | "descriptions", list: string[]) => onSearch({ ...search, [key]: list });
  const submitKw = () => {
    const next = addKeyword(keywords, kw);
    if (next !== keywords) onKeywords(next);
    if (cleanKeyword(kw)) setKw("");
  };

  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-1.5">
        <p className="font-medium">How it can look on Google</p>
        <GooglePreview businessName={businessName} finalUrl={finalUrl} search={search} />
        <p className="text-xs text-muted-foreground">Google mixes your headlines and descriptions to find what works, so the real ad may look a bit different.</p>
      </div>

      <section className="space-y-1.5" aria-labelledby="g-headlines">
        <h3 id="g-headlines" className="font-medium">Headlines <span className="font-normal text-muted-foreground">({search.headlines.length}, need {HEADLINES_MIN} to {limits.headlinesMax}, up to {limits.headline} characters each)</span></h3>
        <ul className="space-y-1.5">
          {search.headlines.map((h, i) => (
            <TextRow key={i} label={`Headline ${i + 1}`} value={h} max={limits.headline} removeLabel={`Remove headline ${i + 1}`}
              onChange={(v) => setList("headlines", search.headlines.map((x, j) => (j === i ? v : x)))}
              onRemove={search.headlines.length > HEADLINES_MIN ? () => setList("headlines", search.headlines.filter((_, j) => j !== i)) : undefined} />
          ))}
        </ul>
        {search.headlines.length < limits.headlinesMax && (
          <Button type="button" variant="outline" size="sm" onClick={() => setList("headlines", [...search.headlines, ""])}><Plus /> Add headline</Button>
        )}
      </section>

      <section className="space-y-1.5" aria-labelledby="g-descriptions">
        <h3 id="g-descriptions" className="font-medium">Descriptions <span className="font-normal text-muted-foreground">({search.descriptions.length}, need {DESCRIPTIONS_MIN} to {limits.descriptionsMax}, up to {limits.description} characters each)</span></h3>
        <ul className="space-y-1.5">
          {search.descriptions.map((d, i) => (
            <TextRow key={i} multiline label={`Description ${i + 1}`} value={d} max={limits.description} removeLabel={`Remove description ${i + 1}`}
              onChange={(v) => setList("descriptions", search.descriptions.map((x, j) => (j === i ? v : x)))}
              onRemove={search.descriptions.length > DESCRIPTIONS_MIN ? () => setList("descriptions", search.descriptions.filter((_, j) => j !== i)) : undefined} />
          ))}
        </ul>
        {search.descriptions.length < limits.descriptionsMax && (
          <Button type="button" variant="outline" size="sm" onClick={() => setList("descriptions", [...search.descriptions, ""])}><Plus /> Add description</Button>
        )}
      </section>

      <section className="space-y-1.5">
        <Label htmlFor="google-final-url">Web page people land on</Label>
        <Input id="google-final-url" type="url" inputMode="url" value={finalUrl} onChange={(e) => onFinalUrl(e.target.value)} />
        <p className="text-xs font-medium text-muted-foreground">Words shown after your web address (optional)</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["path1", "path2"] as const).map((k, i) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-muted-foreground" aria-hidden>/</span>
              <Input aria-label={`Web address word ${i + 1}`} value={search[k]} aria-invalid={adTextLength(search[k]) > limits.path}
                onChange={(e) => onSearch({ ...search, [k]: e.target.value.replace(/[\s/]/g, "") })} />
              <span className="w-12 text-right"><Counter id={`google-${k}-n`} value={search[k]} max={limits.path} /></span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-1.5" aria-labelledby="g-keywords">
        <h3 id="g-keywords" className="font-medium">What people search for</h3>
        <p className="text-xs text-muted-foreground">Your ad can show when people search these. &ldquo;Close match&rdquo; also covers searches with extra words. &ldquo;Exact&rdquo; covers only this search and ones that mean the same. Tap the label to switch.</p>
        <ul className="flex flex-wrap gap-1.5" aria-label="Search phrases">
          {keywords.map((k) => (
            <li key={k.text} className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pl-2.5 pr-1.5 text-secondary-foreground">
              {k.text}
              <button type="button" className="rounded-full border border-border bg-background/70 px-1.5 text-[11px] hover:bg-accent"
                onClick={() => onKeywords(keywords.map((x) => (x.text === k.text ? { ...x, match: x.match === "PHRASE" ? "EXACT" : "PHRASE" } : x)))}
                aria-label={`${k.text}: ${MATCH_LABEL[k.match]}. Switch to ${MATCH_LABEL[k.match === "PHRASE" ? "EXACT" : "PHRASE"]}`}>
                {MATCH_LABEL[k.match]}
              </button>
              <button type="button" className="rounded-full hover:text-destructive" onClick={() => onKeywords(keywords.filter((x) => x.text !== k.text))} aria-label={`Remove ${k.text}`}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submitKw(); }}>
          <Input aria-label="Add a search phrase" placeholder="e.g. emergency plumber" value={kw} onChange={(e) => setKw(e.target.value)} className="sm:w-64" />
          <Button type="submit" variant="outline" disabled={!cleanKeyword(kw)}><Plus /> Add</Button>
        </form>
      </section>

      {blockers.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2" role="status">
          <p className="font-medium">Fix these before you continue:</p>
          <ul className="list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
