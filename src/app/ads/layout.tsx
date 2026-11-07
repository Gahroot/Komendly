import { fraunces } from "@/components/studio/fonts";
import { StudioBackdrop } from "@/components/studio/studio-backdrop";
import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";

/** Every /ads/* page lives in the same night studio as the homepage. */
export default function AdsLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudioRoot className={`${fraunces.variable} studio-app relative isolate min-h-screen`}>
      <StudioBackdrop />
      {children}
    </StudioRoot>
  );
}
