"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config = {
  sent: { label: "Sent", color: "#a970ff" },
  clicks: { label: "Clicks", color: "#5ee6ff" },
  replies: { label: "Replies", color: "#ff8a4c" },
  signups: { label: "Signups", color: "#ffcf4a" },
} satisfies ChartConfig;

/** 30 days of KlyDaily rollups (zero-filled). */
export function KlyChart({ data }: { data: { date: string; sent: number; clicks: number; replies: number; signups: number }[] }) {
  return (
    <ChartContainer config={config} className="h-56 w-full">
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.12} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} minTickGap={20} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {(Object.keys(config) as (keyof typeof config)[]).map((k) => (
          <Area key={k} dataKey={k} type="monotone" stroke={`var(--color-${k})`} fill={`var(--color-${k})`} fillOpacity={k === "sent" ? 0.18 : 0.08} strokeWidth={2} isAnimationActive={false} />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
