/* eslint-disable @next/next/no-img-element -- presigned bucket URLs via redirect; next/image can't optimise them */
import type { Extraction } from "@/lib/ads/contracts";

export function BrandKitPreview({ extraction, logoUrl }: { extraction: Extraction; logoUrl: string | null }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <img src={logoUrl} alt={`${extraction.brandName} logo`} className="h-10 max-w-32 rounded-md border bg-muted object-contain p-1" />
        ) : (
          <div className="flex size-10 items-center justify-center rounded-md border bg-muted text-sm font-semibold">
            {extraction.brandName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <p className="font-medium">{extraction.brandName}</p>
          <p className="text-xs text-muted-foreground">{extraction.domain}</p>
        </div>
      </div>
      {extraction.colors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {extraction.colors.map((c) => (
            <div key={`${c.hex}-${c.role}`} className="flex items-center gap-2 rounded-full border px-2 py-1 text-xs">
              {/* brand colour swatch: user data, intentionally inline */}
              <span className="size-4 rounded-full border" style={{ backgroundColor: c.hex }} />
              <span className="font-mono">{c.hex}</span>
              <span className="text-muted-foreground">{c.role}</span>
            </div>
          ))}
        </div>
      )}
      {extraction.fonts.length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm">
          {extraction.fonts.map((f) => (
            <span key={`${f.family}-${f.role}`}>
              <span className="font-medium">{f.family}</span> <span className="text-muted-foreground">({f.role})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
