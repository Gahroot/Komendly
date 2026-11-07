"use client";

import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/** One editable sourced item: the statement, where it came from, optional quote and kind. */
export interface SourcedRow {
  text: string;
  sourceUrl: string;
  quote?: string;
  kind?: string;
}

interface Props {
  label: string;
  rows: SourcedRow[];
  onChange: (next: SourcedRow[]) => void;
  max: number;
  showQuote?: boolean;
  kinds?: readonly string[];
  defaultSource: string;
}

function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

export function BrandSourcedListEditor({ label, rows, onChange, max, showQuote, kinds, defaultSource }: Props) {
  const set = (i: number, patch: Partial<SourcedRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
      {rows.map((r, i) => {
        const href = safeHref(r.sourceUrl);
        return (
          <div key={i} className="glass-subtle space-y-2 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <Textarea value={r.text} onChange={(e) => set(i, { text: e.target.value })} aria-label={`${label} ${i + 1}`} rows={2} className="min-h-0 flex-1 resize-y" maxLength={500} />
              <Button type="button" variant="ghost" size="icon" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}><Trash2 /></Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {kinds && (
                <Select value={r.kind} onValueChange={(kind) => set(i, { kind })}>
                  <SelectTrigger className="w-full sm:w-36" aria-label={`${label} ${i + 1} kind`}><SelectValue /></SelectTrigger>
                  <SelectContent>{kinds.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                </Select>
              )}
              <Input value={r.sourceUrl} onChange={(e) => set(i, { sourceUrl: e.target.value })} aria-label={`${label} ${i + 1} source link`} placeholder="https://… (where this is stated)" className="min-w-0 flex-1 text-xs" maxLength={2048} />
              {href && (
                <Button asChild variant="ghost" size="sm" className="self-start sm:self-auto">
                  <a href={href} target="_blank" rel="noopener noreferrer">Source <ExternalLink aria-hidden /></a>
                </Button>
              )}
            </div>
            {showQuote && (
              <Input value={r.quote ?? ""} onChange={(e) => set(i, { quote: e.target.value })} aria-label={`${label} ${i + 1} quote from the site`} placeholder="Exact words from the site" className="text-xs italic" maxLength={1000} />
            )}
          </div>
        );
      })}
      {rows.length < max && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { text: "", sourceUrl: defaultSource, quote: showQuote ? "" : undefined, kind: kinds?.[0] }])}>
          <Plus /> Add {label.toLowerCase()}
        </Button>
      )}
    </div>
  );
}
