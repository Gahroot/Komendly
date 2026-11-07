import Link from "next/link";
import { fraunces } from "@/components/studio/fonts";
import { StudioBackdrop } from "@/components/studio/studio-backdrop";
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
      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 pb-12 pt-8 text-xs text-muted-foreground sm:flex-row sm:px-6">
        <p>© {new Date().getFullYear()} Komendly</p>
        <nav className="flex gap-4" aria-label="Footer">
          <Link href="/testimonials" className="hover:text-foreground">Video testimonials</Link>
          <Link href="/blog" className="hover:text-foreground">Blog</Link>
          <Link href="/ads/billing" className="hover:text-foreground">Pricing</Link>
        </nav>
      </footer>
    </StudioRoot>
  );
}
