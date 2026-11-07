import { StudioBackdrop } from "@/components/studio/studio-backdrop";
import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";

/** Email confirmation lives in the same night studio as the rest of the Ads journey. */
export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudioRoot className="studio-app relative isolate min-h-screen">
      <StudioBackdrop />
      {children}
    </StudioRoot>
  );
}
