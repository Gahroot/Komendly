"use client";

import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";

/** Studio atmosphere for the Kly page inside admin (tokens also reach portaled dialogs/sheets). */
export function KlyStage({ children }: { children: React.ReactNode }) {
  return <StudioRoot className="relative -mx-4 overflow-hidden rounded-3xl px-4 pb-8 pt-4 sm:-mx-6 sm:px-6">{children}</StudioRoot>;
}
