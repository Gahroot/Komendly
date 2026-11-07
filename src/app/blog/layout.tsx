import { fraunces } from "@/components/studio/fonts";
import { StudioBackdrop } from "@/components/studio/studio-backdrop";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";

/** The blog lives in the same night studio as the homepage and /ads. */
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudioRoot className={`${fraunces.variable} studio-app relative isolate min-h-screen`}>
      <StudioBackdrop />
      <StudioNav signedIn={false} />
      {children}
      <StudioFooter />
    </StudioRoot>
  );
}
