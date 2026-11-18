// "Make your own free ads from your website" CTA on public share surfaces (system viral_branding). Hidden when the
// sys_viral_branding kill switch is off. Server component.
import { prisma } from "@/lib/prisma";
import { systemEnabled } from "@/lib/growth/systems";
import { MADE_WITH_CTA, madeWithCtaUrl, VIRAL_KEY } from "@/lib/growth/viral-branding";

export async function MadeWithCta({ surface, contentId, className = "" }: { surface: string; contentId: string; className?: string }) {
  if (!(await systemEnabled(prisma, VIRAL_KEY))) return null;
  return (
    <p className={`text-center text-sm text-muted-foreground ${className}`}>
      Made with Komendly.{" "}
      <a href={madeWithCtaUrl(surface, contentId)} className="font-semibold text-[var(--studio-gold)] underline underline-offset-4 hover:opacity-90">{MADE_WITH_CTA}</a>
    </p>
  );
}
