import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OzzyLazy } from "@/components/ozzy";
import { loadShare } from "@/lib/studio/share";
import { trackStudioShareView } from "@/lib/studio/analytics";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const share = await loadShare((await params).token).catch(() => null);
  const title = share ? `${share.title}: made with Ozzy` : "Made with Ozzy";
  return { title, description: "A video made by chatting with Ozzy, the dingo wizard. Make yours free.", robots: { index: false, follow: true }, openGraph: { title, type: "video.other" } };
}

/** Public share page for a Studio render: autoplay, then the viral CTA. */
export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const share = await loadShare(token, { countView: true });
  if (!share) notFound();
  await trackStudioShareView(token);
  const portrait = share.ratio === "9:16" || share.ratio === "4:5";
  const [w, h] = share.ratio.split(":").map(Number);
  const cta = `/ads/signup?next=/studio&utm_source=studio_share&utm_medium=share&utm_campaign=${encodeURIComponent(token)}`;
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col items-center gap-8 px-4 py-10 md:flex-row md:justify-center md:gap-12">
      <div className={`overflow-hidden rounded-2xl border border-white/12 bg-black shadow-[0_30px_80px_-30px_#000] ${portrait ? "h-[min(62dvh,640px)] max-w-full" : "w-full max-w-2xl"}`} style={{ aspectRatio: w && h ? `${w} / ${h}` : "9 / 16" }}>
        <video src={share.videoUrl} poster={share.posterUrl ?? undefined} autoPlay muted loop playsInline controls className="h-full w-full object-contain" />
      </div>
      <div className="max-w-sm text-center md:text-left">
        <OzzyLazy size={110} perch="ground" />
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--studio-gold)]">Made with Ozzy</p>
        <h1 className="mt-2 text-balance font-display text-3xl text-[oklch(0.97_0.03_80)] sm:text-4xl">{share.title}</h1>
        <p className="mt-3 text-[15px] text-[oklch(0.86_0.03_80)]">This video was made just by chatting with Ozzy, the dingo wizard. Tell him what you want and he makes it.</p>
        <Link href={cta} className="spellbar__cta mt-6 inline-flex h-12 items-center rounded-xl px-7 text-base font-semibold">Make yours free with Ozzy</Link>
        <p className="mt-3 text-xs text-[oklch(0.75_0.03_290)]">Your first video is free. No card needed.</p>
      </div>
    </main>
  );
}
