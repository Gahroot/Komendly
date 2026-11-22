"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MetaAccountPicker } from "@/components/ads/meta-account-picker";

interface Props {
  workspaceId: string;
  connected: boolean;
  viaPartner: boolean;
  /** Formatted expiry of the stored partner token, or a note when the system token is in use. */
  expiryLabel: string | null;
  selection: { adAccountId: string | null; pageId: string | null } | null;
  requestedAt: string | null;
}

type Assets = { adAccounts: Array<{ id: string; name: string; readiness: { ok: boolean; issues: Array<{ code: string; text: string }> } }>; pages: Array<{ id: string; name: string }> };

/** Founding customers: connect Komendly's own Meta login to this workspace (partner access) and pick their account + Page. */
export function PartnerMetaCard({ workspaceId, connected, viaPartner, expiryLabel, selection, requestedAt }: Props) {
  const router = useRouter();
  const [assets, setAssets] = useState<Assets | null>(null);
  const [loading, setLoading] = useState(false);
  const [adAccountId, setAdAccountId] = useState(selection?.adAccountId ?? "");
  const [pageId, setPageId] = useState(selection?.pageId ?? "");
  const base = `/api/admin/ads/workspaces/${workspaceId}/meta`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(base, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error ?? "Couldn't load Meta assets");
      else if (data.connected) setAssets({ adAccounts: data.adAccounts, pages: data.pages });
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || (e.data as { type?: string })?.type !== "komendly:meta") return;
      router.refresh();
      void load();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [router, load]);

  const save = async (acc: string, page: string) => {
    if (!acc || !page) return;
    const res = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adAccountId: acc, pageId: page }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(data.error ?? "Couldn't save");
    else { toast.success("Ad account + Page saved"); router.refresh(); }
  };

  const picked = assets?.adAccounts.find((a) => a.id === adAccountId);
  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium">Meta (partner access)</p>
      <p className="text-muted-foreground">
        {!connected ? "Not connected." : viaPartner ? "Connected with Komendly's token (partner access)." : "Connected by the customer's own Meta login."}
        {requestedAt && <> Owner said partner access is ready on {requestedAt}.</>}
      </p>
      {viaPartner && expiryLabel && <p role="status">Partner token {expiryLabel}</p>}
      <Button variant="outline" onClick={() => window.open(`/api/ads/meta/connect?forWorkspace=${encodeURIComponent(workspaceId)}`, "komendly-meta", "width=600,height=760")}>
        {viaPartner ? "Reconnect via partner access" : "Connect via partner access"}
      </Button>
      {connected && (
        <div className="space-y-3">
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "List ad accounts + Pages"}</Button>
          {assets && (
            <>
              <MetaAccountPicker adAccounts={assets.adAccounts} pages={assets.pages} adAccountId={adAccountId} pageId={pageId}
                onAdAccount={(id) => { setAdAccountId(id); void save(id, pageId); }} onPage={(id) => { setPageId(id); void save(adAccountId, id); }} />
              {picked && !picked.readiness.ok && (
                <ul className="list-disc pl-4 text-destructive">{picked.readiness.issues.map((i) => <li key={i.code}>{i.text}</li>)}</ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
