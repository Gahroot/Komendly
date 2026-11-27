import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BACKLOG_EVENT, currentBacklog } from "@/lib/product-intel/backlog";
import { prisma } from "@/lib/prisma";

export async function BacklogCard() {
  const rows = currentBacklog(await prisma.adsEvent.findMany({ where: { name: BACKLOG_EVENT }, orderBy: { createdAt: "desc" }, take: 600, select: { props: true, createdAt: true, name: true } }));
  const digest = await prisma.adsEvent.findFirst({ where: { name: "product_digest" }, orderBy: { createdAt: "desc" }, select: { props: true, createdAt: true } });
  const open = rows.filter((r) => r.status !== "done" && r.status !== "rejected");
  const counts = Object.fromEntries(["proposed", "approved", "in_progress", "done", "rejected"].map((s) => [s, rows.filter((r) => r.status === s).length]));
  return (
    <Card>
      <CardHeader><CardTitle>Product backlog (sys_product_loop)</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")}. Score = customers x severity x commercial impact / effort (x1.5 on the #1 business constraint). Code changes are proposals; only allow-listed config is auto-applied.</p>
        {open.length === 0 ? <p>No backlog rows yet: the loop is off, has not run, or has no signals. That is a data gap, not good news.</p> : (
          <ol className="space-y-3">
            {open.slice(0, 5).map((r) => (
              <li key={r.id} className="rounded-md border p-3">
                <p className="font-medium">{r.title} <span className="text-muted-foreground">({r.status}, score {r.score})</span></p>
                <p>{r.why}</p>
                <ul className="list-disc pl-5 text-muted-foreground">{(r.evidence ?? []).slice(0, 3).map((e) => <li key={e}>{e}</li>)}</ul>
                {r.autoAction ? <p className="text-xs">Auto-apply candidate: <code>{JSON.stringify(r.autoAction)}</code></p> : null}
              </li>
            ))}
          </ol>
        )}
        {digest ? <details><summary className="cursor-pointer">Last weekly digest ({digest.createdAt.toISOString().slice(0, 10)})</summary><pre className="whitespace-pre-wrap text-xs">{String((digest.props as { text?: string })?.text ?? "")}</pre></details> : null}
      </CardContent>
    </Card>
  );
}
