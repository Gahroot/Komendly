import { loadJourney } from "@/lib/growth/proof-server";
import { GUARANTEE_DAYS } from "@/lib/growth/proof";

/** "Live in 7 days" strip for a new Growth Autopilot customer. States only what stored data shows. Hidden once live for 14+ days. */
export async function LiveTracker({ workspaceId }: { workspaceId: string }) {
  const now = new Date();
  const j = await loadJourney(workspaceId, now).catch(() => null);
  if (!j || !j.steps[0].done) return null;
  const live = j.steps[3];
  if (live.done && live.at && now.getTime() - new Date(live.at).getTime() > 14 * 86_400_000) return null;
  return (
    <section aria-label="Setup progress" className="rounded-xl border bg-card p-4 text-card-foreground">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{j.line}</p>
        {!j.done && j.day !== null && (
          <p className="text-xs text-muted-foreground">{j.overdue ? `Day ${j.day}: later than the ${GUARANTEE_DAYS} days we aim for` : `Day ${Math.min(j.day, GUARANTEE_DAYS)} of ${GUARANTEE_DAYS}`}</p>
        )}
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-2 text-xs">
        {j.steps.map((s) => (
          <li key={s.key} className={`rounded-md border px-2 py-1.5 ${s.done ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground"}`}>
            <span aria-hidden>{s.done ? "✓ " : "○ "}</span>{s.label}
            {s.done && s.at && <span className="block text-[11px] font-normal text-muted-foreground">{s.at.slice(0, 10)}</span>}
          </li>
        ))}
      </ol>
      {j.need && <p className="mt-3 text-sm"><span className="font-medium">Next from you:</span> {j.need}</p>}
      {j.overdue && <p className="mt-2 text-sm text-muted-foreground">Write to nolan@komendly.com and we'll sort it out.</p>}
    </section>
  );
}
