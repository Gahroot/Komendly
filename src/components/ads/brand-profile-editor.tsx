"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAdBrand } from "@/hooks/useAdBrand";
import { changedFields, editedKeys, isHex, PROOF_KINDS, toBrandForm, type BrandForm, type ProofKind } from "@/lib/ads/brand-form";
import type { BrandDetail } from "@/lib/ads/brand-view";
import { AdsApiError, postJson } from "@/lib/ads/run-client";
import { BrandAvatar } from "./brand-avatar";
import { BrandColorEditor } from "./brand-color-editor";
import { BrandEditorSection } from "./brand-editor-section";
import { BrandFieldLabel } from "./brand-field-label";
import { BrandFontEditor } from "./brand-font-editor";
import { BrandSourcedListEditor, type SourcedRow } from "./brand-sourced-list-editor";

const proofKind = (k: string | undefined): ProofKind => PROOF_KINDS.find((p) => p === k) ?? "other";

function Editor({ brand, onSaved }: { brand: BrandDetail; onSaved: (b: BrandDetail) => void }) {
  const saved = useMemo(() => toBrandForm(brand), [brand]);
  const [draft, setDraft] = useState<BrandForm>(saved);
  const [saving, setSaving] = useState(false);
  const edited = editedKeys(brand);
  const changes = changedFields(saved, draft);
  const dirty = Object.keys(changes).length > 0;
  const invalid = draft.colors.some((c) => !isHex(c.hex));
  const set = <K extends keyof BrandForm>(key: K, value: BrandForm[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const fallbackSource = brand.url;

  async function save() {
    setSaving(true);
    try {
      const updated = await postJson<BrandDetail>(`/api/ads/brands/${brand.id}`, changes, "PATCH");
      onSaved(updated);
      setDraft(toBrandForm(updated));
      toast.success("Brand profile saved. Your next run for this site will use it.");
    } catch (err) {
      toast.error(err instanceof AdsApiError ? err.message : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-center gap-4">
        <BrandAvatar name={brand.name ?? brand.domain} logoUrl={brand.logoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-3xl font-semibold tracking-tight">{brand.name ?? brand.domain}</h1>
          <a href={brand.url} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary">{brand.domain}</a>
        </div>
      </div>

      <div className="glass-subtle flex gap-3 rounded-xl p-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p className="text-muted-foreground">
          This is what we know about <span className="font-medium text-foreground">{brand.domain}</span>. Every new run for this website reuses it, so your fixes here carry over and we don&apos;t re-guess them. Ads only make claims listed under Facts.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <BrandEditorSection title="Look" description="Colours, fonts and logo used on your ads." contentClassName="space-y-6">
            <div className="space-y-2">
              <BrandFieldLabel htmlFor="brand-name" edited={edited.has("name")}>Brand name</BrandFieldLabel>
              <Input id="brand-name" value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-2">
              <BrandFieldLabel edited={edited.has("colors")}>Colours</BrandFieldLabel>
              <BrandColorEditor colors={draft.colors} onChange={(v) => set("colors", v)} />
            </div>
            <div className="space-y-2">
              <BrandFieldLabel edited={edited.has("fonts")}>Fonts</BrandFieldLabel>
              <BrandFontEditor fonts={draft.fonts} onChange={(v) => set("fonts", v)} />
            </div>
            <div className="space-y-2">
              <BrandFieldLabel edited={false} help="Taken from your website. Update the logo on your site and start a new run to refresh it.">Logo</BrandFieldLabel>
              <BrandAvatar name={brand.name ?? brand.domain} logoUrl={brand.logoUrl} size="lg" />
            </div>
          </BrandEditorSection>

        <BrandEditorSection title="Who you sell to" description="The agent writes every ad from these." contentClassName="space-y-6">
            <div className="space-y-2">
              <BrandFieldLabel htmlFor="brand-audience" edited={edited.has("audience")}>Audience</BrandFieldLabel>
              <Textarea id="brand-audience" value={draft.audience} onChange={(e) => set("audience", e.target.value)} rows={3} maxLength={500} />
            </div>
            <div className="space-y-2">
              <BrandFieldLabel htmlFor="brand-offer" edited={edited.has("mainOffer")}>Main offer</BrandFieldLabel>
              <Textarea id="brand-offer" value={draft.mainOffer} onChange={(e) => set("mainOffer", e.target.value)} rows={3} maxLength={500} />
            </div>
            <div className="space-y-2">
              <BrandFieldLabel htmlFor="brand-landing" edited={edited.has("landingPage")} help="Where people go when they click an ad.">Landing page</BrandFieldLabel>
              <Input id="brand-landing" type="url" value={draft.landingPage} onChange={(e) => set("landingPage", e.target.value)} maxLength={2048} />
            </div>
            <div className="space-y-2">
              <BrandFieldLabel htmlFor="brand-voice" edited={edited.has("voice")}>Voice</BrandFieldLabel>
              <Input id="brand-voice" value={draft.voice} onChange={(e) => set("voice", e.target.value)} maxLength={500} />
            </div>
          </BrandEditorSection>

        <BrandEditorSection title="Pains" description="The moments your buyers feel, in their words." contentClassName="space-y-2" meta={`${draft.pains.length}/8`} defaultOpen={false}>
            <BrandFieldLabel edited={edited.has("pains")}>Pains ({draft.pains.length}/8)</BrandFieldLabel>
            <BrandSourcedListEditor label="Pain" max={8} showQuote defaultSource={fallbackSource} rows={draft.pains} onChange={(rows) => set("pains", rows.map((r) => ({ text: r.text, sourceUrl: r.sourceUrl, quote: r.quote || undefined })))} />
          </BrandEditorSection>

        <BrandEditorSection title="Proof" description="Testimonials, numbers and awards from your site." contentClassName="space-y-2" meta={`${draft.proof.length}`} defaultOpen={false}>
            <BrandFieldLabel edited={edited.has("proof")}>Proof</BrandFieldLabel>
            <BrandSourcedListEditor label="Proof" max={20} kinds={PROOF_KINDS} defaultSource={fallbackSource} rows={draft.proof} onChange={(rows) => set("proof", rows.map((r) => ({ text: r.text, sourceUrl: r.sourceUrl, kind: proofKind(r.kind) })))} />
          </BrandEditorSection>

        <BrandEditorSection title="Facts" description="The only claims ads may make. Each one links to where your site says it." className="lg:col-span-2" contentClassName="space-y-2" meta={`${draft.facts.length}`} defaultOpen={false}>
            <BrandFieldLabel edited={edited.has("facts")}>Facts</BrandFieldLabel>
            <BrandSourcedListEditor
              label="Fact"
              max={40}
              showQuote
              defaultSource={fallbackSource}
              rows={draft.facts.map((f): SourcedRow => ({ text: f.claim, sourceUrl: f.sourceUrl, quote: f.quote }))}
              onChange={(rows) => set("facts", rows.map((r) => ({ claim: r.text, sourceUrl: r.sourceUrl, quote: r.quote ?? "" })))}
            />
          </BrandEditorSection>
      </div>

      <div className={cn("glass-float sticky bottom-3 z-30 rounded-2xl sm:bottom-4", !dirty && !invalid && "hidden")}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {invalid ? "Fix the colour hex codes to save." : dirty ? `${Object.keys(changes).length} section(s) changed` : "All changes saved"}
          </p>
          <div className="flex gap-2">
            {dirty && <Button type="button" variant="ghost" onClick={() => setDraft(saved)} disabled={saving}>Discard</Button>}
            <Button type="button" onClick={save} disabled={!dirty || invalid || saving}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrandProfileEditor({ id }: { id: string }) {
  const { data, error, mutate } = useAdBrand(id);
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/ads/brands"><ArrowLeft aria-hidden /> All brands</Link></Button>
      {error ? (
        <p className="text-sm text-destructive">{error instanceof AdsApiError && error.status === 404 ? "This brand profile doesn't exist." : "Couldn't load this brand profile. Refresh to try again."}</p>
      ) : !data ? (
        <div className="grid gap-6 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>
      ) : (
        <Editor key={data.updatedAt} brand={data} onSaved={(b) => void mutate(b, { revalidate: false })} />
      )}
    </div>
  );
}
