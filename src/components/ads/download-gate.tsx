"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DOWNLOAD_GATE_MESSAGE, downloadNeedsVerifiedEmail } from "@/lib/ads/download-gate";
import { VerifyEmailNotice } from "./verify-email-notice";

interface GateState {
  locked: boolean;
  open: () => void;
}

const GateContext = createContext<GateState>({ locked: false, open: () => undefined });

/** Download buttons on a run consult this: while locked they open the confirm-email dialog instead of downloading. */
export function useDownloadGate(): GateState {
  return useContext(GateContext);
}

const POLL_MS = 10_000;

/**
 * Unverified, unpaid users can see their free trial ads but not download them (the API answers 403 email_unverified).
 * While locked, re-checks the workspace on focus and every 10 s so clicking the email link unlocks downloads here.
 */
export function DownloadGateProvider({ isTrial, isPaid, emailVerified, email, recheck, children }: { isTrial: boolean; isPaid: boolean | undefined; emailVerified: boolean | undefined; email?: string; recheck: () => void; children: React.ReactNode }) {
  const locked = isPaid !== undefined && emailVerified !== undefined && downloadNeedsVerifiedEmail({ isTrial, isPaid, emailVerified });
  const [dialog, setDialog] = useState(false);
  useEffect(() => {
    if (!locked) return;
    const onFocus = () => recheck();
    window.addEventListener("focus", onFocus);
    const t = window.setInterval(recheck, POLL_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(t);
    };
  }, [locked, recheck]);
  const open = useCallback(() => setDialog(true), []);
  const value = useMemo(() => ({ locked, open }), [locked, open]);
  return (
    <GateContext.Provider value={value}>
      {children}
      {locked && (
        <Dialog open={dialog} onOpenChange={setDialog}>
          <DialogContent className="max-h-[95dvh] overflow-y-auto rounded-3xl p-0 sm:max-w-md">
            <DialogTitle className="sr-only">Confirm your email</DialogTitle>
            <DialogDescription className="sr-only">{DOWNLOAD_GATE_MESSAGE}</DialogDescription>
            <p className="px-6 pt-6 text-center text-sm font-medium">{DOWNLOAD_GATE_MESSAGE}</p>
            <VerifyEmailNotice email={email} title="Confirm your email" purpose="to download your ads" onContinue={recheck} />
          </DialogContent>
        </Dialog>
      )}
    </GateContext.Provider>
  );
}
