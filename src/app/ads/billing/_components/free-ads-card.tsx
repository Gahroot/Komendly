import Link from "next/link";
import { Gift } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LinkBlock } from "@/lib/ads/lifecycle/free-ads";

/** Post-purchase card: the same "Ways to get more free ads" block the lifecycle emails carry. */
export function FreeAdsCard({ block }: { block: LinkBlock }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg"><Gift className="size-4 text-primary" aria-hidden />{block.title}</CardTitle>
        <CardDescription>Share Komendly and earn more ads on top of your plan.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-4 sm:grid-cols-3">
          {block.items.map((i) => (
            <li key={i.href} className="space-y-1.5 text-sm">
              <p className="text-muted-foreground">{i.text}</p>
              <Link href={i.href} className="font-medium text-primary underline-offset-4 hover:underline">{i.linkLabel} &rarr;</Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
