import { fraunces } from "@/components/studio/fonts";
import { StudioBackdrop } from "@/components/studio/studio-backdrop";
import { StudioRoot } from "@/components/studio/studio-spell";
import "@/components/studio/studio.css";
import "@/components/studio-chat/studio-chat.css";

export const metadata = { title: "Ozzy Studio", robots: { index: false, follow: false } };

/** Ozzy Studio lives in the same night sky as the rest of the product. Auth is enforced in (app)/layout. */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudioRoot className={`${fraunces.variable} studio-app relative isolate min-h-dvh`}>
      <StudioBackdrop />
      {children}
    </StudioRoot>
  );
}
