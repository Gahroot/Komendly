"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Font = { family: string; role: string; sourceUrl?: string };

export function BrandFontEditor({ fonts, onChange }: { fonts: Font[]; onChange: (next: Font[]) => void }) {
  const set = (i: number, patch: Partial<Font>) => onChange(fonts.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="space-y-2">
      {fonts.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={f.family} onChange={(e) => set(i, { family: e.target.value })} aria-label={`Font ${i + 1} family`} placeholder="Inter" className="min-w-0 flex-1" maxLength={80} />
          <Input value={f.role} onChange={(e) => set(i, { role: e.target.value })} aria-label={`Font ${i + 1} role`} placeholder="heading" className="w-28" maxLength={40} />
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(fonts.filter((_, j) => j !== i))} aria-label={`Remove font ${f.family}`}><Trash2 /></Button>
        </div>
      ))}
      {fonts.length < 6 && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...fonts, { family: "", role: "body" }])}><Plus /> Add font</Button>
      )}
    </div>
  );
}
