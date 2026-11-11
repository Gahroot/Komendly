import { fraunces } from "@/components/studio/fonts";
import { StudioBackdrop } from "@/components/studio/studio-backdrop";
import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";

/** The testimonials product lives in the same night studio as Ads (see DESIGN.md). */
export function TestiStudio({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <StudioRoot className={`${fraunces.variable} studio-app relative isolate min-h-screen ${className}`}>
      <StudioBackdrop />
      {children}
    </StudioRoot>
  );
}
