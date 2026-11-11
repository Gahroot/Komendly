"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** One text field + POST to an admin endpoint (note, payout reference...), then refresh. */
export function InputActionForm({ url, body, field, placeholder, label, required = false, variant = "default" }: {
  url: string;
  body: Record<string, unknown>;
  field: string;
  placeholder: string;
  label: string;
  required?: boolean;
  variant?: "default" | "outline" | "destructive";
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, [field]: value || undefined }) });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error ?? "Action failed");
      else {
        toast.success(`${label}: done`);
        setValue("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input className="h-8 min-w-32 text-xs" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} required={required} />
      <Button size="sm" variant={variant} disabled={busy} type="submit">{label}</Button>
    </form>
  );
}
