"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ExternalLink, Gift, Link2, Loader2, MessageSquareQuote, Palette, Target, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAdCountdown } from "@/hooks/useAdCountdown";
import type { AdGoalValue, Corrections, Extraction } from "@/lib/ads/contracts";
import { AdsApiError, postJson } from "@/lib/ads/run-client";
import { track } from "@/lib/analytics/track";
import { ozzy } from "@/components/ozzy/store";
import type { RunView } from "@/lib/ads/run-types";
import { BrandKitPreview } from "./brand-kit-preview";
import { ConfirmCountdown } from "./confirm-countdown";
import { GoalChips } from "./goal-chips";
import { PainListEditor } from "./pain-list-editor";
import { RetryExtractionDialog } from "./retry-extraction-dialog";
import { ReviewSectionCard } from "./review-section-card";

const HOLD_EVERY_MS = 10_000;

interface Draft {
  audience: string;
  mainOffer: string;
  pains: string[];
  landingPage: string;
  goal: AdGoalValue;
}

function initialDraft(e: Extraction, goal: AdGoalValue): Draft {
  return { audience: e.audience, mainOffer: e.mainOffer, pains: e.pains.map((p) => p.text), landingPage: e.landingPage, goal: goal === "auto" ? e.suggestedGoal : goal };
}

/** Only the fields the user actually changed. */
function diff(draft: Draft, base: Draft): Corrections {
  const c: Corrections = {};
  if (draft.audience.trim() !== base.audience) c.audience = draft.audience.trim();
  if (draft.mainOffer.trim() !== base.mainOffer) c.mainOffer = draft.mainOffer.trim();
  const pains = draft.pains.map((p) => p.trim()).filter(Boolean);
  if (JSON.stringify(pains) !== JSON.stringify(base.pains)) c.pains = pains;
  if (draft.landingPage.trim() !== base.landingPage) c.landingPage = draft.landingPage.trim();
  if (draft.goal !== base.goal) c.goal = draft.goal;
  return c;
}

export function ExtractionReview({ run, extraction, onChanged }: { run: RunView; extraction: Extraction; onChanged: () => void }) {
  const base = useMemo(() => initialDraft(extraction, run.goal), [extraction, run.goal]);
  const [draft, setDraft] = useState<Draft>(base);
  const [focused, setFocused] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const confirming = useRef(false);
  const editing = focused || dialogOpen;
  const seconds = useAdCountdown(run.confirmDeadline, run.serverNow, editing);

  useEffect(() => {
    void postJson(`/api/ads/runs/${run.id}/events`, { name: "extraction_shown" }).catch(() => undefined);
  }, [run.id]);

  useEffect(() => {
    if (editing) ozzy.emit({ type: "review:editing" });
  }, [editing]);

  // Server is the source of truth: keep extending the deadline while the user edits.
  useEffect(() => {
    if (!editing) return;
    const hold = () => void postJson(`/api/ads/runs/${run.id}/hold`, {}).then(onChanged).catch(() => undefined);
    hold();
    const t = window.setInterval(hold, HOLD_EVERY_MS);
    return () => window.clearInterval(t);
  }, [editing, run.id, onChanged]);

  const confirm = useCallback(
    async (auto: boolean) => {
      if (confirming.current) return;
      confirming.current = true;
      setSubmitting(true);
      try {
        const corrections = diff(draft, base);
        await postJson(`/api/ads/runs/${run.id}/confirm`, { corrections, auto });
        track("run_confirmed", { run_id: run.id, auto, edited: Object.keys(corrections).length > 0 });
        ozzy.emit({ type: "review:confirmed" });
        onChanged();
      } catch (err) {
        if (err instanceof AdsApiError && err.code === "already_confirmed") {
          toast.warning("Your ads had already started, so these edits weren't applied.", { description: "You can change the brand profile and generate more ads afterwards." });
          onChanged();
          return;
        }
        confirming.current = false;
        setSubmitting(false);
        toast.error(err instanceof Error ? err.message : "Couldn't start generation.");
      }
    },
    [draft, base, run.id, onChanged],
  );

  useEffect(() => {
    if (seconds !== 0 || editing) return;
    const t = window.setTimeout(() => void confirm(true), 0);
    return () => window.clearTimeout(t);
  }, [seconds, editing, confirm]);

  // If the run moves on without us (auto-confirm elsewhere, deadline passed) say so instead of dropping edits silently.
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = Object.keys(diff(draft, base)).length > 0;
  }, [draft, base]);
  useEffect(
    () => () => {
      if (dirtyRef.current && !confirming.current) toast.warning("Your ads had already started, so your edits weren't applied.");
    },
    [],
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div
      className="w-full space-y-6"
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="glass md:sticky md:top-16 md:z-10 flex flex-col gap-4 rounded-2xl p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-3">
          <div>
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-medium">Here&apos;s what Ozzy found</h2>
            <p className="text-sm text-muted-foreground">Check it, fix anything that&apos;s off, and he&apos;ll build your ads from it.</p>
          </div>
          <ConfirmCountdown seconds={seconds} paused={editing} />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row md:shrink-0">
          <RetryExtractionDialog runId={run.id} retriesLeft={run.retriesLeft} onDone={onChanged} onOpenChange={setDialogOpen} />
          <Button size="lg" onClick={() => void confirm(false)} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : null} Looks right, make my ads <ArrowRight />
          </Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ReviewSectionCard icon={Users} title="Audience" description="Who the ads speak to.">
          <Textarea id="audience" aria-label="Audience" rows={3} maxLength={500} value={draft.audience} onChange={(e) => set("audience", e.target.value)} />
        </ReviewSectionCard>
        <ReviewSectionCard icon={Gift} title="Main offer" description="What you want people to buy or try.">
          <Textarea id="offer" aria-label="Main offer" rows={3} maxLength={500} value={draft.mainOffer} onChange={(e) => set("mainOffer", e.target.value)} />
        </ReviewSectionCard>
        <ReviewSectionCard icon={MessageSquareQuote} title="Top pains" description="From your site and reviews. Each ad leads with one." className="md:col-span-2">
          <PainListEditor value={draft.pains} sources={extraction.pains} onChange={(p) => set("pains", p)} />
        </ReviewSectionCard>
        <ReviewSectionCard icon={Link2} title="Landing page" description="Where every ad sends clicks.">
          <div className="flex items-center gap-2">
            <Input id="landing" aria-label="Landing page" type="url" value={draft.landingPage} onChange={(e) => set("landingPage", e.target.value)} />
            <Button asChild variant="outline" size="icon" aria-label="Open landing page">
              <a href={draft.landingPage} target="_blank" rel="noopener noreferrer"><ExternalLink /></a>
            </Button>
          </div>
        </ReviewSectionCard>
        <ReviewSectionCard icon={Target} title="Goal" description={run.goal === "auto" ? "Detected from your site. Change it if needed." : "What the ads should drive."}>
          <GoalChips value={draft.goal} onChange={(g) => set("goal", g)} />
        </ReviewSectionCard>
        <ReviewSectionCard icon={Palette} title="Brand kit" description="Logo, colours and fonts used in every ad." className="md:col-span-2">
          <BrandKitPreview extraction={extraction} logoUrl={run.logoUrl} />
        </ReviewSectionCard>
      </div>
    </div>
  );
}
