"use client";

import { useEffect } from "react";
import { watchHuman, type HumanSignal } from "@/lib/growth/human-signal";

function seen(key: string): boolean {
  try {
    return Boolean(sessionStorage.getItem(key));
  } catch {
    return false;
  }
}

function mark(key: string): void {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // storage blocked: the beacon may fire again on a reload, the server counts a view either way
  }
}

/**
 * Counts a gift view once per tab session, and only once a person is there: the first trusted pointer/scroll/key/touch
 * while the tab is visible, or 5 s on a visible, focused page. Mail scanners and sandboxes load the page (many run its JS)
 * but do neither. The server skips bots, Meta IPs and the sender, and records `human` from `interacted`.
 */
export function GiftViewBeacon({ token }: { token: string }) {
  useEffect(() => {
    const key = `gift_viewed:${token}`;
    if (seen(key)) return;
    return watchHuman(
      { win: window, doc: document, setInterval: (fn, ms) => window.setInterval(fn, ms), clearInterval: (id) => window.clearInterval(id as number), now: () => Date.now() },
      (signal: HumanSignal) => {
        if (seen(key)) return;
        mark(key);
        void fetch(`/api/ads/gift-public/${token}/view`, { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ interacted: true, signal }) }).catch(() => undefined);
      },
    );
  }, [token]);
  return null;
}
