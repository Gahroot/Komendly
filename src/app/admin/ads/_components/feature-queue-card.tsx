"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trophy } from "lucide-react";
import { toast } from "sonner";
import { CopyTextButton } from "@/components/growth/copy-text-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface FeatureQueueItem {
  id: string;
  status: string;
  brandName: string | null;
  handle: string | null;
  headline: string;
  caption: string;
  postUrl: string | null;
  imageUrl: string;
  consentAt: string;
  email: string;
}

/** One consented ad in the Ad of the week queue: preview, caption, shortlist/feature/decline. */
export function FeatureQueueCard({ item }: { item: FeatureQueueItem }) {
  const router = useRouter();
  const [caption, setCaption] = useState(item.caption);
  const [postUrl, setPostUrl] = useState(item.postUrl ?? "");
  const [busy, setBusy] = useState(false);
  async function act(action: "shortlist" | "feature" | "decline") {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ads/features", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ featureId: item.id, action, caption, postUrl }) });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error ?? "Action failed");
      else {
        toast.success(action === "feature" ? "Featured: owner emailed" : `${action}: done`);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  const slug = (item.brandName ?? "ad").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <div className="relative bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.imageUrl} alt={item.headline} className="aspect-[4/5] w-full object-cover" loading="lazy" />
        <Badge className="absolute left-2 top-2" variant={item.status === "featured" ? "default" : "secondary"}>{item.status === "featured" && <Trophy className="size-3" />}{item.status}</Badge>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3 text-sm">
        <div><p className="font-medium">{item.brandName ?? "—"} {item.handle && <span className="text-primary">{item.handle}</span>}</p><p className="text-xs text-muted-foreground">{item.email} · consented {item.consentAt.slice(0, 10)}</p></div>
        <p className="line-clamp-2 text-xs text-muted-foreground">&ldquo;{item.headline}&rdquo;</p>
        <Textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} className="text-xs" aria-label="Caption" />
        <Input value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="Post URL (after posting)" className="h-8 text-xs" />
        <div className="flex flex-wrap gap-1.5">
          <CopyTextButton text={caption} label="Copy caption" />
          <a href={item.imageUrl} download={`${slug}-ad-of-the-week.png`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-accent"><Download className="size-3.5" />Image</a>
        </div>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {item.status === "consented" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("shortlist")}>Shortlist</Button>}
          {item.status !== "featured" && <Button size="sm" disabled={busy} onClick={() => void act("feature")}>Feature</Button>}
          {item.status !== "featured" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("decline")}>Decline</Button>}
        </div>
      </div>
    </div>
  );
}
