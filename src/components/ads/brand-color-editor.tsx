"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isHex } from "@/lib/ads/brand-form";

type Color = { hex: string; role: string };

export function BrandColorEditor({ colors, onChange }: { colors: Color[]; onChange: (next: Color[]) => void }) {
  const set = (i: number, patch: Partial<Color>) => onChange(colors.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2">
      {colors.map((c, i) => {
        const valid = isHex(c.hex);
        return (
          <div key={i} className="flex items-center gap-2">
            <label className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border focus-within:ring-[3px] focus-within:ring-ring">
              {/* brand colour swatch: user data, intentionally inline */}
              <span className="absolute inset-0" style={{ backgroundColor: valid ? c.hex : "transparent" }} />
              <input type="color" value={valid && c.hex.length === 7 ? c.hex : "#000000"} onChange={(e) => set(i, { hex: e.target.value.toUpperCase() })} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`Pick colour ${i + 1}`} />
            </label>
            <Input value={c.hex} onChange={(e) => set(i, { hex: e.target.value.trim() })} aria-label={`Colour ${i + 1} hex`} aria-invalid={!valid} className="w-24 font-mono uppercase sm:w-28" maxLength={9} />
            <Input value={c.role} onChange={(e) => set(i, { role: e.target.value })} aria-label={`Colour ${i + 1} role`} placeholder="primary" className="min-w-0 flex-1" maxLength={40} />
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(colors.filter((_, j) => j !== i))} aria-label={`Remove colour ${c.hex}`}><Trash2 /></Button>
          </div>
        );
      })}
      {colors.some((c) => !isHex(c.hex)) && <p className="text-xs text-destructive">Use hex like #1A2B3C.</p>}
      {colors.length < 12 && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...colors, { hex: "#888888", role: "accent" }])}><Plus /> Add colour</Button>
      )}
    </div>
  );
}
