"use client";

import { ExternalLink, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Extraction } from "@/lib/ads/contracts";

/** Editable top pains; shows the source link and quote when the text is unchanged from extraction. */
export function PainListEditor({ value, sources, onChange }: { value: string[]; sources: Extraction["pains"]; onChange: (pains: string[]) => void }) {
  return (
    <div className="space-y-3">
      {value.map((text, i) => {
        const source = sources.find((p) => p.text === text);
        return (
          <div key={i} className="space-y-1">
            <div className="flex gap-2">
              <Textarea
                value={text}
                rows={2}
                maxLength={300}
                aria-label={`Pain ${i + 1}`}
                onChange={(e) => onChange(value.map((v, j) => (j === i ? e.target.value : v)))}
                className="min-h-0 resize-none"
              />
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove pain" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </div>
            {source && (
              <p className="flex items-start gap-1 text-xs text-muted-foreground">
                {source.quote && <span className="italic">&ldquo;{source.quote}&rdquo;</span>}
                <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 underline underline-offset-2">
                  source <ExternalLink className="size-3" />
                </a>
              </p>
            )}
          </div>
        );
      })}
      {value.length < 8 && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, ""])}>
          <Plus /> Add a pain
        </Button>
      )}
    </div>
  );
}
