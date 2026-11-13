"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const MCP_URL = "https://www.komendly.com/api/mcp";
const KEY_PLACEHOLDER = "<your-key>";

function snippets(key: string) {
  return [
    { id: "claude-code", title: "Claude Code", hint: "Run in your terminal.", code: `claude mcp add --transport http ozzy ${MCP_URL} --header "Authorization: Bearer ${key}"` },
    {
      id: "mcp-json",
      title: "Claude Desktop / Cursor (mcp.json)",
      hint: "Add to your MCP config file, then restart the app.",
      code: JSON.stringify({ mcpServers: { ozzy: { url: MCP_URL, headers: { Authorization: `Bearer ${key}` } } } }, null, 2),
    },
    {
      id: "cli",
      title: "Komendly CLI",
      hint: "For scripts and agents with a terminal.",
      code: `export KOMENDLY_API_KEY=${key}\nnpx komendly whoami\nnpx komendly video "A 15s promo for my bakery" --wait --out .`,
    },
  ];
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((id: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800);
    });
  }, []);
  return { copied, copy };
}

function CopyButton({ id, text, copied, copy, label = "Copy" }: { id: string; text: string; copied: string | null; copy: (id: string, t: string) => void; label?: string }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={() => copy(id, text)} className="h-8 gap-1.5 text-muted-foreground hover:text-foreground">
      {copied === id ? <Check aria-hidden className="size-4 text-[var(--studio-gold)]" /> : <Copy aria-hidden className="size-4" />}
      {copied === id ? "Copied" : label}
    </Button>
  );
}

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never";
}

export function ApiKeysPanel() {
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const { copied, copy } = useCopy();

  const load = useCallback(async () => {
    const res = await fetch("/api/account/api-keys", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as { keys?: KeyRow[]; error?: string };
    if (!res.ok) setError(data.error ?? "Couldn't load your keys.");
    setKeys(data.keys ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() || "My agent" }) });
      const data = (await res.json().catch(() => ({}))) as { secret?: string; error?: string };
      if (!res.ok || !data.secret) throw new Error(data.error ?? "Couldn't create the key.");
      setSecret(data.secret);
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the key.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(k: KeyRow) {
    if (!window.confirm(`Revoke "${k.name}"? Agents using it stop working right away.`)) return;
    setError(null);
    const res = await fetch(`/api/account/api-keys/${k.id}`, { method: "DELETE" });
    if (!res.ok) setError("Couldn't revoke the key. Try again.");
    await load();
  }

  const active = (keys ?? []).filter((k) => !k.revokedAt);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Ozzy for agents"
        title="Let your AI agent use Ozzy"
        description="Claude, Cursor, ChatGPT or your own scripts can make Ozzy videos and Ad Packs for you, on your plan and credits. Create a key, then paste one of the setups below."
      />

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-[oklch(0.7_0.17_25/0.5)] bg-[oklch(0.7_0.17_25/0.12)] p-3 text-sm text-[oklch(0.86_0.1_25)]">
          <AlertCircle aria-hidden className="size-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <KeyRound aria-hidden className="size-5 text-[var(--studio-gold)]" />
            API keys
          </CardTitle>
          <CardDescription>A key acts as you. Keep it secret; revoke it if it leaks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="key-name" className="text-muted-foreground">Key name</Label>
              <Input id="key-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Claude Code on my laptop" className="h-11" />
            </div>
            <Button type="submit" disabled={busy} className="spellbar__cta h-11 rounded-xl px-5 font-semibold">
              {busy ? <Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> : null}
              Create key
            </Button>
          </form>

          {keys === null ? (
            <div className="flex justify-center py-6"><Loader2 aria-hidden className="size-6 animate-spin text-[var(--studio-gold)]" /></div>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No keys yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className={`truncate font-medium ${k.revokedAt ? "text-muted-foreground line-through" : "text-foreground"}`}>{k.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <code>{k.prefix}…</code> · created {fmt(k.createdAt)} · last used {fmt(k.lastUsedAt)}
                      {k.revokedAt ? ` · revoked ${fmt(k.revokedAt)}` : ""}
                    </p>
                  </div>
                  {!k.revokedAt && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => void revoke(k)} className="h-9 gap-1.5 text-muted-foreground hover:text-foreground">
                      <Trash2 aria-hidden className="size-4" /> Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Set up your agent</CardTitle>
          <CardDescription>
            Replace <code>{KEY_PLACEHOLDER}</code> with your key{active.length ? "" : " (create one above)"}. Then ask, for example: “Use Ozzy to make a 15 second promo video for my bakery.”
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {snippets(KEY_PLACEHOLDER).map((s) => (
            <SnippetBlock key={s.id} id={s.id} title={s.title} hint={s.hint} code={s.code} copied={copied} copy={copy} />
          ))}
          <p className="text-xs text-muted-foreground">
            Apps that can&apos;t send headers can use <code>{MCP_URL}/k/{KEY_PLACEHOLDER}</code> as the server URL. Treat that URL like a password.
          </p>
        </CardContent>
      </Card>

      <Dialog open={secret !== null} onOpenChange={(o) => { if (!o) setSecret(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Copy your key now</DialogTitle>
            <DialogDescription>This is the only time it&apos;s shown. Store it somewhere safe.</DialogDescription>
          </DialogHeader>
          {secret && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-black/30 p-3">
                <code className="min-w-0 flex-1 break-all text-sm text-foreground">{secret}</code>
                <CopyButton id="secret" text={secret} copied={copied} copy={copy} />
              </div>
              <SnippetBlock id="secret-claude" title="Claude Code" hint="Ready to paste, with your key filled in." code={snippets(secret)[0]?.code ?? ""} copied={copied} copy={copy} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setSecret(null)} className="spellbar__cta rounded-xl px-5 font-semibold">I&apos;ve saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SnippetBlock({ id, title, hint, code, copied, copy }: { id: string; title: string; hint: string; code: string; copied: string | null; copy: (id: string, t: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <CopyButton id={id} text={code} copied={copied} copy={copy} />
      </div>
      <pre className="overflow-x-auto rounded-xl border border-border bg-black/30 p-3 text-xs leading-relaxed text-foreground"><code>{code}</code></pre>
    </div>
  );
}
