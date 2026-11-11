import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
  id?: string;
}

/** Studio section heading: gold mono kicker, Fraunces title, muted lead. */
export function SectionHeading({ eyebrow, title, description, className, id }: SectionHeadingProps) {
  return (
    <div className={cn("mx-auto max-w-2xl text-center", className)}>
      {eyebrow && <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--studio-gold)]">{eyebrow}</p>}
      <h2 id={id} className="font-display text-3xl font-medium tracking-[-0.02em] text-foreground sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-base text-muted-foreground sm:text-lg">{description}</p>}
    </div>
  );
}
