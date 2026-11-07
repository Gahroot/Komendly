"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Option { id: string; name: string }

export function MetaAccountPicker({
  adAccounts, pages, adAccountId, pageId, onAdAccount, onPage,
}: {
  adAccounts: Option[];
  pages: Option[];
  adAccountId: string;
  pageId: string;
  onAdAccount: (id: string) => void;
  onPage: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="meta-ad-account">Ad account</Label>
        <Select value={adAccountId} onValueChange={onAdAccount}>
          <SelectTrigger id="meta-ad-account" className="w-full"><SelectValue placeholder={adAccounts.length ? "Choose ad account" : "No ad accounts found"} /></SelectTrigger>
          <SelectContent>
            {adAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="meta-page">Facebook Page</Label>
        <Select value={pageId} onValueChange={onPage}>
          <SelectTrigger id="meta-page" className="w-full"><SelectValue placeholder={pages.length ? "Choose page" : "No pages found"} /></SelectTrigger>
          <SelectContent>
            {pages.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
