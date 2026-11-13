import { OzzyLazy } from "@/components/ozzy/OzzyLazy";

/** Friendly Ozzy empty state for admin tables and lists. Presentation only. */
export function AdminEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-3 py-6 text-sm text-muted-foreground">
      <OzzyLazy size={40} speech={false} pose={{ form: "classic", expression: "happy", motion: "idle" }} />
      <span>{children}</span>
    </div>
  );
}
