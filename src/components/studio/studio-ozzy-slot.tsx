"use client";

import { useEffect } from "react";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
import { ozzy, useOzzyState } from "@/components/ozzy/store";

/** Ozzy perched on an element, with his line beside him (never over the headline). Emits page:landing once when `greet`. */
export function StudioOzzySlot({ size, className = "", greet = false, interactive = true }: { size: number; className?: string; greet?: boolean; interactive?: boolean }) {
  const { line } = useOzzyState();
  useEffect(() => {
    if (greet) ozzy.emit({ type: "page:landing" });
  }, [greet]);
  return (
    <div className={`flex items-end gap-1 ${className}`}>
      <div className="shrink-0" style={{ width: size, height: size }}>
        <OzzyLazy size={size} perch="ledge" interactive={interactive} speech={false} label="Ozzy, your ad wizard. Click to say hi." />
      </div>
      <div role="status" aria-live="polite" className="mb-[72px] min-w-0">
        {line ? (
          <p key={line} className="ozzy-say relative w-max max-w-[min(15rem,calc(100vw-11rem))] rounded-xl border-2 border-[#1a0f3a] bg-[#fff1d6] px-3 py-1.5 text-left text-[13px] font-semibold leading-snug text-[#2a1a6e] shadow-[0_3px_0_#1a0f3a]">
            {line}
          </p>
        ) : null}
      </div>
    </div>
  );
}
