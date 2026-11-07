export function BrandSwatches({ colors: all, size = "sm", max = 6 }: { colors: { hex: string; role: string }[]; size?: "sm" | "md"; max?: number }) {
  if (all.length === 0) return null;
  const colors = all.slice(0, max);
  const dim = size === "sm" ? "size-4" : "size-6";
  return (
    <div className="flex shrink-0 -space-x-1" aria-label={`Brand colours: ${all.map((c) => c.hex).join(", ")}`}>
      {colors.map((c) => (
        // brand colour swatch: user data, intentionally inline
        <span key={`${c.hex}-${c.role}`} title={`${c.role} ${c.hex}`} className={`${dim} rounded-full border border-border ring-2 ring-background`} style={{ backgroundColor: c.hex }} />
      ))}
    </div>
  );
}
