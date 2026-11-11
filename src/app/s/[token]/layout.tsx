import { fraunces } from "@/components/studio/fonts";
import { StudioBackdrop } from "@/components/studio/studio-backdrop";
import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudioRoot className={`${fraunces.variable} relative isolate min-h-dvh`}>
      <StudioBackdrop />
      {children}
    </StudioRoot>
  );
}
