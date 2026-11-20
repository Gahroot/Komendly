// Page shell for /ad-examples/ideas pages (studio look, nav, footer, JSON-LD).
import { JsonLd } from "@/components/json-ld";
import { Breadcrumbs, CtaBlock } from "@/components/ad-examples/parts";
import { PaidNote } from "@/components/ad-examples/playbook-parts";
import { fraunces } from "@/components/studio/fonts";
import { StudioFooter } from "@/components/studio/studio-footer";
import { StudioNav } from "@/components/studio/studio-nav";
import { StudioRoot } from "@/components/studio/studio-spell";
import { absoluteUrl } from "@/lib/site";
import { breadcrumbJsonLd, faqJsonLd, galleryPageJsonLd, graph } from "@/lib/seo/jsonld";
import "@/components/studio/studio.css";

export function IdeasShell(props: {
  crumbs: Array<{ name: string; path: string }>;
  h1: string;
  intro: string;
  description: string;
  items: Array<{ name: string; url: string }>;
  faq?: ReadonlyArray<{ q: string; a: string }>;
  campaign: string;
  ctaTitle: string;
  children: React.ReactNode;
}) {
  const path = props.crumbs[props.crumbs.length - 1]!.path;
  return (
    <StudioRoot className={`${fraunces.variable} min-h-screen bg-[#0c0820]`}>
      <JsonLd data={graph(
        galleryPageJsonLd({ name: props.h1, description: props.description, path, items: props.items }),
        breadcrumbJsonLd(props.crumbs),
        props.faq?.length ? faqJsonLd([...props.faq], absoluteUrl(path)) : null,
      )} />
      <StudioNav signedIn={false} />
      <main>
        <header className="mx-auto max-w-3xl px-4 pt-8 text-center sm:px-6 sm:pt-14">
          <div className="flex justify-center"><Breadcrumbs items={props.crumbs.map((c, i) => (i === props.crumbs.length - 1 ? { name: c.name } : { name: c.name, href: c.path }))} /></div>
          <h1 className="font-display mt-5 text-balance text-[2.2rem] font-medium leading-[1.05] tracking-[-0.025em] sm:text-6xl">{props.h1}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">{props.intro}</p>
        </header>
        {props.children}
        <div className="px-4 pt-20 sm:px-6">
          <CtaBlock title={props.ctaTitle} campaign={props.campaign} content="end" label="Get my 3 free ads" />
        </div>
        <PaidNote />
        <div className="pb-20" />
      </main>
      <StudioFooter />
    </StudioRoot>
  );
}
