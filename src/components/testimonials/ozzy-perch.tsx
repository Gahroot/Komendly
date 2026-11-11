"use client";

import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
import type { OzzyExpression, OzzyForm, OzzyMotion } from "@/components/ozzy/types";
import { cn } from "@/lib/utils";

export interface OzzyMood {
  form: OzzyForm;
  expression: OzzyExpression;
  motion?: OzzyMotion;
  /** One short line, shown beside him (never over text). Pass only for real events. */
  line?: string;
}

/** Decorative Ozzy perched on a top edge, pose driven by the caller's real state. Never interactive here. */
export function OzzyPerch({ mood, size = 88, className, lineSide = "right" }: { mood: OzzyMood; size?: number; className?: string; lineSide?: "left" | "right" }) {
  return (
    <div className={cn("pointer-events-none flex items-end gap-1", lineSide === "left" && "flex-row-reverse", className)}>
      <div className="shrink-0" style={{ width: size, height: size }}>
        <OzzyLazy size={size} perch="ledge" speech={false} pose={{ form: mood.form, expression: mood.expression, motion: mood.motion ?? "idle" }} />
      </div>
      <div role="status" aria-live="polite" className="mb-[52px] min-w-0">
        {mood.line ? (
          <p key={mood.line} className="ozzy-say relative w-max max-w-[min(14rem,calc(100vw-10rem))] rounded-xl border-2 border-[#1a0f3a] bg-[#fff1d6] px-3 py-1.5 text-left text-[13px] font-semibold leading-snug text-[#2a1a6e] shadow-[0_3px_0_#1a0f3a]">
            {mood.line}
          </p>
        ) : null}
      </div>
    </div>
  );
}
