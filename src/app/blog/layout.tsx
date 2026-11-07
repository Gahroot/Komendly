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
      {/* React 19 hoists this into <head>; done here (not metadata.alternates) so page canonicals don't drop it. */}
      <link rel="alternate" type="application/rss+xml" title="Komendly Journal RSS" href="/blog/feed.xml" />
      <StudioBackdrop />
      <StudioNav signedIn={false} />
      {children}
      <StudioFooter />
    </StudioRoot>
  );
}
