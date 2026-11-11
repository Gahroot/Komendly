"use client";
import { OzzyLazy } from "@/components/ozzy";

/** Ozzy perched on the composer's top edge, with one short line beside him (never over inputs). */
export function OzzyPerch({ line, size = 64 }: { line: string | null; size?: number }) {
  return (
    <div className="pointer-events-none flex items-end gap-1 pl-2" aria-live="polite">
      <OzzyLazy size={size} perch="ledge" speech={false} />
      {line && <p key={line} className="studio-bubble mb-5 max-w-[220px]">{line}</p>}
    </div>
  );
}
