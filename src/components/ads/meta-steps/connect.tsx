"use client";

import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConnectStep({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="space-y-4 text-sm">
      <p>Connect the Facebook login that manages your ads account and your business&apos;s Facebook Page.</p>
      <ul className="space-y-2 text-muted-foreground">
        <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /> We only create ads you pick. Everything is created paused.</li>
        <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /> You can disconnect any time.</li>
      </ul>
      <Button onClick={onConnect}>Connect Meta account</Button>
      <p className="text-xs text-muted-foreground">A Meta window opens. When you&apos;re done there, this window moves on by itself.</p>
    </div>
  );
}
