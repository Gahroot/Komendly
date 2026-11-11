import { prisma } from "@/lib/prisma";
import { FBC_COOKIE, FBP_COOKIE, FIRST_TOUCH_COOKIE, LAST_TOUCH_COOKIE, parseFirstTouch, type FirstTouch } from "@/lib/analytics/first-touch";
import { sendMetaEvents, type MetaEventName, type MetaServerEvent } from "@/lib/ads/meta-capi";

/** Browser-readable cookie carrying the server event_id so the pixel event reuses it (dedup). */
export const metaEventIdCookie = (event: MetaEventName) => `kmd_meid_${event}`;

/** AdsEvent -> Meta event(s). Unmapped events are not sent to Meta. */
export const ADS_TO_META: Readonly<Record<string, readonly MetaEventName[]>> = {
  signed_up: ["CompleteRegistration"],
  trial_started: ["StartTrial"],
  run_completed: ["TrialCompleted"],
  checkout_started: ["InitiateCheckout"],
  // Purchase (+ Subscribe for subscriptions) per paid Stripe checkout session; paid_converted stays DB-only.
  purchased: ["Purchase", "Subscribe"],
  renewed: ["Renewal"],
  // Ozzy Studio: first delivered video (custom event, once per workspace). The engine writes studio_first_render
  // directly; the web forwards it when it sees one (studio checkout is a checkout_started with props.app = "studio").
  studio_first_render: ["StudioFirstVideo"],
};

/** Deterministic event_id per funnel step, shared with the browser (see metaEventIdCookie / success page). */
export function metaEventId(event: MetaEventName, d: { workspaceId?: string; userId?: string; runId?: string; props?: Record<string, unknown> }, now: Date): string {
  const invoice = typeof d.props?.invoiceId === "string" ? d.props.invoiceId : undefined;
  const session = typeof d.props?.checkoutSessionId === "string" ? d.props.checkoutSessionId : undefined;
  switch (event) {
    case "StartTrial":
    case "TrialCompleted":
      return `${event}:${d.runId ?? d.workspaceId ?? d.userId ?? now.getTime()}`;
    case "InitiateCheckout":
      return `${event}:${d.workspaceId ?? d.userId}:${now.getTime()}`;
    case "Purchase":
    case "Subscribe":
      return `${event}:${session ?? invoice ?? d.workspaceId ?? now.getTime()}`;
    case "Renewal":
      return `${event}:${invoice ?? now.getTime()}`;
    default:
      // CompleteRegistration happens once per workspace.
      return `${event}:${d.workspaceId ?? d.userId ?? now.getTime()}`;
  }
}

export type MetaAttribution = { fbc?: string; fbp?: string; ip?: string; ua?: string; url?: string; country?: string; state?: string; city?: string; zip?: string; firstTouch?: FirstTouch | null; lastTouch?: FirstTouch | null };

function decodeHeader(v: string | null): string | undefined {
  if (!v) return undefined;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** "Jane van Dyke" -> first "jane", last "van dyke" (last = everything after the first word). */
export function splitName(name: string | null | undefined): { firstName?: string; lastName?: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  return { firstName: parts[0], ...(parts.length > 1 ? { lastName: parts.slice(1).join(" ") } : {}) };
}

/** Request context when called inside a route handler; null in webhooks' absence of a browser / outside a request. */
async function requestContext(): Promise<{ attr: MetaAttribution; setCookie: (n: string, v: string) => void } | null> {
  try {
    const { cookies, headers } = await import("next/headers");
    const [c, h] = await Promise.all([cookies(), headers()]);
    const ft = parseFirstTouch(c.get(FIRST_TOUCH_COOKIE)?.value);
    const lt = parseFirstTouch(c.get(LAST_TOUCH_COOKIE)?.value);
    const ua = h.get("user-agent") ?? undefined;
    const attr: MetaAttribution = {
      fbc: c.get(FBC_COOKIE)?.value ?? lt?.fbc ?? ft?.fbc,
      fbp: c.get(FBP_COOKIE)?.value,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined,
      ua: ua && !/^Stripe/i.test(ua) ? ua : undefined,
      url: h.get("referer") ?? undefined,
      // Vercel geo headers (from the visitor's IP): extra Meta match keys, hashed before sending.
      country: h.get("x-vercel-ip-country") ?? undefined,
      state: h.get("x-vercel-ip-country-region") ?? undefined,
      city: decodeHeader(h.get("x-vercel-ip-city")),
      zip: h.get("x-vercel-ip-postal-code") ?? undefined,
      firstTouch: ft,
      lastTouch: lt,
    };
    const setCookie = (n: string, v: string) => {
      try {
        c.set(n, v, { path: "/", maxAge: 600, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
      } catch {
        // read-only cookie store (server component): the browser event just won't dedupe
      }
    };
    return { attr, setCookie };
  } catch {
    return null;
  }
}

/** Server-only events (Stripe webhook): reuse the attribution saved on the workspace's signed_up event. */
async function storedAttribution(workspaceId?: string): Promise<MetaAttribution> {
  if (!workspaceId) return {};
  const ev = await prisma.adsEvent.findFirst({ where: { workspaceId, name: "signed_up" }, select: { props: true } });
  const props = (ev?.props ?? {}) as { meta?: MetaAttribution; firstTouch?: FirstTouch | null };
  return { ...(props.meta ?? {}), firstTouch: props.meta?.firstTouch ?? props.firstTouch ?? null };
}

function background(p: Promise<unknown>): void {
  const safe = p.catch(() => undefined);
  import("next/server")
    .then(({ after }) => after(() => safe))
    .catch(() => undefined);
}

/**
 * Forward one funnel AdsEvent to Meta CAPI in the background. Returns the attribution used (stored in props)
 * or null for unmapped events. Never throws; never awaits the network.
 */
export async function forwardAdsEventToMeta(
  name: string,
  d: { workspaceId?: string; userId?: string; runId?: string; props?: Record<string, unknown> },
): Promise<MetaAttribution | null> {
  const events = ADS_TO_META[name];
  if (!events) return null;
  const selected = name === "purchased" && d.props?.mode !== "subscription" ? events.filter((e) => e !== "Subscribe") : events;
  try {
    const now = new Date();
    const ctx = await requestContext();
    const live = ctx?.attr ?? {};
    const stored = live.ua ? {} : await storedAttribution(d.workspaceId);
    const attr: MetaAttribution = { ...stored, ...Object.fromEntries(Object.entries(live).filter(([, v]) => v != null)) };
    const user = d.userId ? await prisma.user.findUnique({ where: { id: d.userId }, select: { email: true, name: true } }) : null;
    const amount = typeof d.props?.amountCents === "number" ? d.props.amountCents / 100 : undefined;
    const site = process.env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com";
    const out: MetaServerEvent[] = selected.map((eventName) => {
      const eventId = metaEventId(eventName, d, now);
      ctx?.setCookie(metaEventIdCookie(eventName), eventId);
      return {
        eventName,
        eventId,
        eventTime: now,
        sourceUrl: attr.url ?? `${site}/`,
        user: { email: user?.email, userId: d.userId, ip: attr.ip, userAgent: attr.ua, fbc: attr.fbc, fbp: attr.fbp, ...splitName(user?.name), country: attr.country, state: attr.state, city: attr.city, zip: attr.zip },
        ...(amount !== undefined ? { value: amount, currency: typeof d.props?.currency === "string" ? d.props.currency : "USD" } : {}),
      };
    });
    background(sendMetaEvents(out));
    return attr;
  } catch {
    return null;
  }
}
