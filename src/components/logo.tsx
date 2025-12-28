import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Image src="/logo.svg" alt="Komendly" width={32} height={32} />
      <span className="font-bold text-xl tracking-wide">KOMENDLY</span>
    </div>
  );
}
