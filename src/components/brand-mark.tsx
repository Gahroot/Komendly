import Image from "next/image";
import { cn } from "@/lib/utils";

/** Komendly logo mark: Ozzy (pixel dingo wizard) rising in a night badge. Decorative next to the "Komendly" wordmark. */
export function BrandMark({ className, size = 32 }: { className?: string; size?: number }) {
  return <Image src="/brand/komendly-mark-128.png" alt="" aria-hidden width={size} height={size} className={cn("inline-block shrink-0", className)} />;
}
