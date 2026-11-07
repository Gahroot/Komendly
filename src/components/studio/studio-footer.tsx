import Link from "next/link";
import { OzzyLazy } from "@/components/ozzy/OzzyLazy";
import { ridgeHeights, ridgePath } from "./pixel-art";

const CELL = 8;
const RIDGE = ridgeHeights(200, 29, 5, 3);

const COLS: { title: string; links: { href: string; label: string }[] }[] = [
  { title: "Make ads", links: [{ href: "/#studio-url", label: "Start free" }, { href: "/#examples", label: "Examples" }, { href: "/ads/pricing", label: "Pricing" }, { href: "/ads/login", label: "Sign in" }] },
  { title: "Read", links: [{ href: "/blog", label: "The Journal" }, { href: "/testimonials", label: "Video testimonials" }] },
];

/** Campfire footer: the night ends on a ridge where Ozzy naps by a pixel fire. Shared by home, blog and pricing. */
export function StudioFooter() {
  const h = 10 * CELL;
  return (
    <footer className="relative mt-10 overflow-hidden" aria-label="Site footer">
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-10 pt-6 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <p className="font-display flex items-center gap-2 text-2xl font-semibold">
            <span aria-hidden className="inline-block size-3 rotate-45 bg-[var(--studio-gold)] shadow-[0_0_14px_#ffcf4a99]" />
            Komendly
          </p>
          <p className="max-w-xs text-sm text-muted-foreground">Ozzy turns your website into ads your customers recognise themselves in. Built under the southern sky.</p>
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={c.title} className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--studio-gold)]">{c.title}</p>
            <ul className="space-y-2">
              {c.links.map((l) => (
                <li key={l.href}><Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{l.label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="relative h-[170px]" aria-hidden>
        <svg className="absolute inset-x-0 bottom-0 h-[80px] w-full" viewBox={`0 0 ${RIDGE.length * CELL} ${h}`} preserveAspectRatio="none" shapeRendering="crispEdges">
          <path d={ridgePath(RIDGE, CELL, h)} fill="#140818" />
        </svg>
        <div className="absolute bottom-[34px] left-1/2 flex -translate-x-1/2 items-end gap-1">
          <OzzyLazy size={104} perch="ground" speech={false} pose={{ form: "chill", expression: "sleepy", motion: "sleep" }} />
          <div className="campfire mb-[14px]"><i /><i /><i /><span /></div>
        </div>
        <div className="absolute bottom-[34px] left-1/2 h-24 w-72 -translate-x-[20%] rounded-full bg-[oklch(0.7_0.17_55/0.22)] blur-2xl" />
      </div>
      <div className="relative bg-[#140818] pb-6">
        <p className="mx-auto max-w-6xl px-4 text-xs text-[oklch(0.75_0.04_320)] sm:px-6">© {new Date().getFullYear()} Komendly · Shh, Ozzy&apos;s resting. He&apos;ll be up the moment you paste a link.</p>
      </div>
    </footer>
  );
}
