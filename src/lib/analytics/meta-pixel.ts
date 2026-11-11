"use client";

import type { FunnelEvent } from "./funnel-events";

/** Meta Pixel (browser). Server CAPI events reuse the same event_id (see src/lib/ads/meta-forward.ts). */
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "2076490092891007";

type Params = Record<string, string | number | boolean | undefined>;
type Fbq = (...args: unknown[]) => void;
type Mapping = { events: readonly string[]; custom?: boolean; eventId?: (p: Params) => string | undefined; cookieId?: boolean; onlyWithCookie?: boolean; when?: (p: Params) => boolean };

/** GA4 funnel event -> pixel event(s). `cookieId`: the server set kmd_meid_<Event> on the API response. */
const MAP: Partial<Record<FunnelEvent, Mapping>> = {
  landing_view: { events: ["ViewContent"] },
  offer_view: { events: ["ViewContent"] },
  upsell_view: { events: ["ViewContent"] },
  sign_up: { events: ["CompleteRegistration"], cookieId: true },
  run_started: { events: ["StartTrial"], cookieId: true, onlyWithCookie: true }, // cookie only set for trial runs
  run_completed: { events: ["TrialCompleted"], custom: true, when: (p) => p.is_trial === true, eventId: (p) => (p.run_id ? `TrialCompleted:${p.run_id}` : undefined) },
  begin_checkout: { events: ["InitiateCheckout"], cookieId: true },
  // Needs the checkout session id (explicit event ids); Subscribe only for subscription checkouts.
  purchase: { events: ["Purchase", "Subscribe"], when: (p) => p.source === "ads_billing" && typeof p.meta_event_id_Purchase === "string" },
};

function readCookie(name: string): string | undefined {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : undefined;
}

function send(event: string, custom: boolean, params: Params, eventId: string | undefined, tries = 0): void {
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  // Events fired on mount can run before the pixel snippet (afterInteractive): wait up to ~6 s for it.
  if (typeof fbq !== "function") {
    if (tries < 30) setTimeout(() => send(event, custom, params, eventId, tries + 1), 200);
    return;
  }
  const data = Object.fromEntries(Object.entries(params).filter(([k, v]) => v !== undefined && (k === "value" || k === "currency" || k === "content_name")));
  fbq(custom ? "trackCustom" : "track", event, data, eventId ? { eventID: eventId } : undefined);
}

/** Mirror a funnel event to the pixel. Never throws. `meta_event_id_<Event>` params override ids (e.g. Purchase). */
export function trackMetaPixel(event: FunnelEvent, params: Params): void {
  try {
    const m = MAP[event];
    if (!m || (m.when && !m.when(params))) return;
    for (const name of m.events) {
      if (name === "Subscribe" && event === "purchase" && params.meta_subscription !== true) continue;
      const explicit = params[`meta_event_id_${name}`];
      if (typeof explicit === "string" || !m.cookieId) {
        send(name, Boolean(m.custom), params, typeof explicit === "string" ? explicit : m.eventId?.(params));
        continue;
      }
      // The API response that set the cookie may still be in flight (track fires before fetch): wait up to 4 s.
      let tries = 0;
      const tick = () => {
        const id = readCookie(`kmd_meid_${name}`);
        if (id || tries++ >= 20) {
          if (id) document.cookie = `kmd_meid_${name}=; path=/; max-age=0`;
          if (id || !m.onlyWithCookie) send(name, Boolean(m.custom), params, id);
        } else setTimeout(tick, 200);
      };
      tick();
    }
    if (event === "landing_view") {
      void navigator.sendBeacon?.("/api/ads/landed", JSON.stringify({ path: window.location.pathname }));
      watchEngagement();
    }
  } catch {
    // analytics must never break the product
  }
}

/** Second beacon once the visitor interacts or keeps the page visible for 5 s (review bots rarely do). Fail-silent. */
function watchEngagement(): void {
  try {
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, fire);
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        void navigator.sendBeacon?.("/api/ads/landed", JSON.stringify({ kind: "engaged", path: window.location.pathname }));
      } catch {
        // ignore
      }
    };
    const arm = () => {
      if (!timer && document.visibilityState === "visible") timer = setTimeout(fire, 5000);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") arm();
      else if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    };
    for (const e of events) window.addEventListener(e, fire, { once: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    arm();
  } catch {
    // analytics must never break the product
  }
}
