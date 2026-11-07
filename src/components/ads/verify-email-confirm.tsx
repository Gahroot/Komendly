"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { readPendingRun } from "@/lib/ads/run-client";

type State = "checking" | "ok" | "expired" | "invalid";

export function VerifyEmailConfirm() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<State>(token ? "checking" : "invalid");
  const router = useRouter();
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    void fetch("/api/auth/verify-email/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
        setState(data.ok ? "ok" : data.reason === "expired" ? "expired" : "invalid");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  const copy: Record<State, { title: string; text: string }> = {
    checking: { title: "Confirming your email…", text: "One second." },
    ok: { title: "Email confirmed", text: "Your free ads are unlocked." },
    expired: { title: "This link has expired", text: "Request a new link from the ads page." },
    invalid: { title: "This link isn't valid", text: "It may have been used already. Request a new one from the ads page." },
  };
  return (
    <Card className="w-full max-w-md bg-card/70 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {state === "checking" && <Loader2 className="size-4 animate-spin" />} {copy[state].title}
        </CardTitle>
        <CardDescription>{copy[state].text}</CardDescription>
      </CardHeader>
      {state !== "checking" && (
        <CardFooter>
          {state === "ok" ? (
            <Button onClick={() => router.push(readPendingRun() ? "/ads/start" : "/ads/app")}>Continue to my ads</Button>
          ) : (
            <Button asChild><Link href="/ads/app">Back to ads</Link></Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
