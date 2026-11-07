/* eslint-disable @next/next/no-img-element -- presigned bucket URLs via redirect; next/image can't optimise them */
export function BrandAvatar({ name, logoUrl, size = "md" }: { name: string; logoUrl: string | null; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "h-14 min-w-14 max-w-40" : "size-10";
  return logoUrl ? (
    <img src={logoUrl} alt={`${name} logo`} className={`${dim} shrink-0 rounded-xl border bg-muted object-contain p-1`} />
  ) : (
    <div className={`${dim} flex shrink-0 items-center justify-center rounded-xl border bg-muted text-sm font-semibold`} aria-hidden>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
