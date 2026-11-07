"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const TARGET_SECONDS = 180;

function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Live time-to-first-ad (from confirmation) vs the 3-minute target; freezes once the first ad lands. */
export function FirstAdTimer({ confirmedAt, firstAdAt }: { confirmedAt: string | null; firstAdAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (firstAdAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [firstAdAt]);
  if (!confirmedAt) return null;
  const end = firstAdAt ? new Date(firstAdAt).getTime() : now;
  const secs = Math.max(0, Math.round((end - new Date(confirmedAt).getTime()) / 1000));
  const onTarget = secs <= TARGET_SECONDS;
  return (
    <Badge variant={onTarget ? "secondary" : "outline"} className="gap-1 font-mono tabular-nums">
      <Timer className="size-3" />
      {firstAdAt ? `First ad in ${fmt(secs)}` : `${fmt(secs)} / ${fmt(TARGET_SECONDS)} target`}
    </Badge>
  );
}
