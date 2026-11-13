// Pure maths for the admin "Pricing & offer drop-off" card (pricing_viewed / pricing_plan_clicked + existing offer,
// checkout and payment events). DB loading lives in funnel-queries.ts.
import { isBotVisit } from "./funnel";

/** Crawler / preview user agents: same rule as the visit_landed beacon. */
export const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit/i;

export const PRICING_PAGES = ["/pricing", "/ads/pricing", "/ads/billing", "/dashboard/billing"] as const;
export type PricingPage = (typeof PRICING_PAGES)[number];

/** Normalise a client-sent path to one of the pricing pages, else null. */
export function pricingPageOf(path: unknown): PricingPage | null {
  if (typeof path !== "string") return null;
  const p = path.split(/[?#]/)[0]?.replace(/\/+$/, "") ?? "";
  return (PRICING_PAGES as readonly string[]).includes(p) ? (p as PricingPage) : null;
}

export const OFFER_EVENTS = ["upsell_shown", "offer_modal_shown", "offer_nudge_shown", "studio_paywall_shown", "studio_offer_viewed", "downsell_shown"] as const;
export const CHECKOUT_EVENTS = ["checkout_started", "studio_checkout_started"] as const;
export const PAID_EVENTS = ["purchased", "paid_converted"] as const;
export const PRICING_FUNNEL_EVENTS = ["pricing_viewed", "pricing_plan_clicked", ...OFFER_EVENTS, ...CHECKOUT_EVENTS, ...PAID_EVENTS] as const;

export type FunnelEvent = { name: string; userId: string | null; workspaceId: string | null; props: unknown; createdAt: Date };

export type PricingFunnelInput = {
  events: readonly FunnelEvent[];
  /** workspaceId -> owner userId, so workspace-only events map to a person. */
  ownerOf: ReadonlyMap<string, string>;
  /** userIds whose workspace used its free ad pack. */
  freePackUsers: ReadonlySet<string>;
  internal: { userIds: readonly string[]; workspaceIds: readonly string[]; anonIds: readonly string[] };
};

export type DropoffStep = { key: "viewed" | "offer" | "clicked" | "checkout" | "paid"; label: string; count: number; fromPrev: number | null };
export type RecentViewer = { person: string; lastViewAt: Date; page: string; signedIn: boolean; hadFreePack: boolean; clicked: string[]; checkedOut: boolean; paid: boolean };
export type PricingDropoff = { steps: DropoffStep[]; viewedSignedIn: number; viewedSignedOut: number; botViews: number; recent: RecentViewer[] };

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
const propsOf = (e: FunnelEvent) => (e.props ?? {}) as Record<string, unknown>;

/** Person key: user, else workspace owner, else anonymous browser. Null = can't attribute. */
export function personOf(e: FunnelEvent, ownerOf: ReadonlyMap<string, string>): string | null {
  const u = e.userId ?? (e.workspaceId ? ownerOf.get(e.workspaceId) : undefined);
  if (u) return `u:${u}`;
  const a = str(propsOf(e).anonId);
  return a ? `a:${a}` : null;
}

function isInternal(e: FunnelEvent, i: PricingFunnelInput["internal"], ownerOf: ReadonlyMap<string, string>): boolean {
  if (e.userId && i.userIds.includes(e.userId)) return true;
  if (e.workspaceId && (i.workspaceIds.includes(e.workspaceId) || i.userIds.includes(ownerOf.get(e.workspaceId) ?? ""))) return true;
  const a = str(propsOf(e).anonId);
  return a !== null && i.anonIds.includes(a);
}

const ratio = (n: number, d: number) => (d > 0 ? n / d : null);

/**
 * Unique people per step in the window (each step counted independently, not nested), step-to-step % vs the previous
 * step, the signed-in / signed-out split of pricing viewers and the latest 20 real pricing viewers.
 */
export function pricingDropoff(input: PricingFunnelInput, recentLimit = 20): PricingDropoff {
  const { ownerOf, freePackUsers, internal } = input;
  const sets = { viewed: new Set<string>(), offer: new Set<string>(), clicked: new Set<string>(), checkout: new Set<string>(), paid: new Set<string>() };
  const viewedIn = new Set<string>();
  const clicks = new Map<string, string[]>();
  const views = new Map<string, { at: Date; page: string; signedIn: boolean }>();
  let botViews = 0;
  const sorted = [...input.events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const e of sorted) {
    if (isInternal(e, internal, ownerOf)) continue;
    const p = personOf(e, ownerOf);
    if (!p) continue;
    const props = propsOf(e);
    if (e.name === "pricing_viewed") {
      if (isBotVisit(props)) { botViews++; continue; }
      sets.viewed.add(p);
      const signedIn = props.signedIn === true || p.startsWith("u:");
      if (signedIn) viewedIn.add(p);
      views.set(p, { at: e.createdAt, page: str(props.page) ?? "?", signedIn });
    } else if (e.name === "pricing_plan_clicked") {
      if (isBotVisit(props)) continue;
      sets.clicked.add(p);
      const label = [str(props.clickedPlan) ?? "?", str(props.interval)].filter(Boolean).join("/");
      const list = clicks.get(p) ?? [];
      if (!list.includes(label)) clicks.set(p, [...list, label]);
    } else if ((OFFER_EVENTS as readonly string[]).includes(e.name)) sets.offer.add(p);
    else if ((CHECKOUT_EVENTS as readonly string[]).includes(e.name)) sets.checkout.add(p);
    else if ((PAID_EVENTS as readonly string[]).includes(e.name)) sets.paid.add(p);
  }
  const defs: Array<[DropoffStep["key"], string]> = [["viewed", "Viewed pricing"], ["offer", "Saw an in-app offer"], ["clicked", "Clicked a plan"], ["checkout", "Started checkout"], ["paid", "Paid"]];
  const steps = defs.map(([key, label], i): DropoffStep => {
    const prevKey = defs[i - 1]?.[0];
    return { key, label, count: sets[key].size, fromPrev: prevKey ? ratio(sets[key].size, sets[prevKey].size) : null };
  });
  const recent = [...views.entries()]
    .sort((a, b) => b[1].at.getTime() - a[1].at.getTime() || a[0].localeCompare(b[0]))
    .slice(0, recentLimit)
    .map(([person, v]): RecentViewer => ({
      person,
      lastViewAt: v.at,
      page: v.page,
      signedIn: v.signedIn,
      hadFreePack: person.startsWith("u:") && freePackUsers.has(person.slice(2)),
      clicked: clicks.get(person) ?? [],
      checkedOut: sets.checkout.has(person),
      paid: sets.paid.has(person),
    }));
  return { steps, viewedSignedIn: viewedIn.size, viewedSignedOut: sets.viewed.size - viewedIn.size, botViews, recent };
}
