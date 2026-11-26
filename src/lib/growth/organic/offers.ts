// Marketing offer generator (pure, deterministic). Offers are structures with placeholders ([X]) - never invented prices or
// claims - built from the hand-written trade playbooks, plus the margin maths that tells an owner if a discount can pay off.
import { PLAYBOOKS, type Playbook } from "../trade-playbooks-data";

export type OfferGoal = "new-customers" | "slow-season" | "bigger-sales" | "win-back" | "referrals";
export const OFFER_GOALS: ReadonlyArray<{ id: OfferGoal; label: string }> = [
  { id: "new-customers", label: "Win new customers" }, { id: "slow-season", label: "Fill a slow week or season" },
  { id: "bigger-sales", label: "Raise the average sale" }, { id: "win-back", label: "Win back past customers" }, { id: "referrals", label: "Get referrals" },
];

interface Mechanic { id: string; goals: OfferGoal[]; name: string; line: (s: string, t: string) => string; why: string; watch: string }
const MECHANICS: readonly Mechanic[] = [
  { id: "first-visit", goals: ["new-customers"], name: "First-time customer offer", line: (s) => `New customers: [X% / $X] off your first ${s}. Mention this ad.`, why: "Lowers the risk of trying someone new, and you only pay it once per customer.", watch: "Cap it to first-time customers and one per household, so regulars do not claim it." },
  { id: "free-assessment", goals: ["new-customers"], name: "Free look, no obligation", line: (s) => `Free [inspection / estimate / consultation] for ${s}, no obligation.`, why: "Costs you time, not cash, and gets the person talking to you.", watch: "Only offer it if you can really afford the time. Say how long it takes." },
  { id: "bundle", goals: ["bigger-sales", "new-customers"], name: "Bundle two jobs", line: (s, t) => `Book ${s} together with [second ${t} service] and save [$X].`, why: "Raises the sale size and spreads your travel and setup cost over two jobs.", watch: "Check the bundle price still covers both jobs at your usual margin." },
  { id: "add-on", goals: ["bigger-sales"], name: "Free add-on", line: (s) => `Book ${s} this month and get [small add-on you can deliver cheaply] included.`, why: "A free add-on feels bigger than the discount it costs you.", watch: "Pick an add-on whose cost to you is low and real value to them is clear." },
  { id: "deadline", goals: ["slow-season", "new-customers"], name: "Deadline offer", line: (s) => `${cap(s)}: [offer], book by [date]. Only [N] spots in [month].`, why: "A real date or a real limit gives people a reason to act now instead of later.", watch: "Only use a deadline or spot limit you will honour. Fake scarcity loses trust." },
  { id: "off-peak", goals: ["slow-season"], name: "Off-peak slot discount", line: (s) => `[Weekday / morning] ${s} slots: [X%] off, while they last.`, why: "Fills the hours you would otherwise leave empty, so the marginal cost is low.", watch: "Keep the peak slots at full price so you do not train everyone to wait." },
  { id: "bring-back", goals: ["win-back"], name: "We miss you offer", line: (s) => `It has been a while. [Returning customers]: [offer] on your next ${s}.`, why: "Past customers already trust you, so the offer can be small.", watch: "Send it to people who really bought before, and set an end date." },
  { id: "maintenance", goals: ["win-back", "bigger-sales"], name: "Plan or membership", line: (s) => `Join our [monthly / yearly] plan for ${s} and get [perk] every visit.`, why: "Turns one job into repeat revenue you can plan around.", watch: "Work out what a year of the perks costs you before you price it." },
  { id: "referral", goals: ["referrals", "win-back"], name: "Give and get referral", line: (s) => `Refer a friend: they get [$X] off ${s}, you get [$X] off your next one.`, why: "Both sides win, and a recommendation from a friend is the easiest sale there is.", watch: "Pay the reward only after the friend has paid and the job is done." },
  { id: "review-reward", goals: ["referrals", "new-customers"], name: "Review-based social proof offer", line: (s) => `See what our customers say, then book ${s} with [offer].`, why: "Pairs an offer with real reviews so the offer is not the only reason to trust you.", watch: "Never pay for or gate reviews on a positive rating. Ask every customer." },
];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface OfferIdea { id: string; name: string; line: string; why: string; watch: string }
export function playbookFor(slug: string): Playbook | undefined { return PLAYBOOKS.find((p) => p.slug === slug); }

/** 4-6 offer ideas for a trade and goal. Same input, same output. Placeholders stay in [brackets] for the owner to fill. */
export function generateOffers(tradeSlug: string, goal: OfferGoal): OfferIdea[] {
  const p = playbookFor(tradeSlug);
  if (!p) return [];
  const picks = MECHANICS.filter((m) => m.goals.includes(goal));
  const out: OfferIdea[] = picks.map((m, i) => ({ id: m.id, name: m.name, line: m.line(p.services[i % p.services.length]!, p.term), why: m.why, watch: m.watch }));
  // Add the trade's own common offers (hand-written in the playbook) as starting points.
  for (const o of p.offers.slice(0, 2)) out.push({ id: `common-${out.length}`, name: "Common in your trade", line: cap(o.replace(/\s*\([^)]*\)/g, "").trim()), why: "A pattern customers in your trade already expect.", watch: "Add your own number and an end date before you run it." });
  return out;
}

/** What a discount costs. `margin` and `discount` are fractions of the normal price (0.4 = 40%). Extra sales needed to match old profit. */
export function discountMath(price: number, cost: number, discountPct: number): { normalProfit: number; discountedProfit: number; extraSalesNeededPct: number | null; viable: boolean } {
  if (!(price > 0) || cost < 0 || cost >= price || discountPct < 0 || discountPct >= 100) return { normalProfit: 0, discountedProfit: 0, extraSalesNeededPct: null, viable: false };
  const normalProfit = price - cost;
  const discountedProfit = price * (1 - discountPct / 100) - cost;
  if (discountedProfit <= 0) return { normalProfit, discountedProfit, extraSalesNeededPct: null, viable: false };
  return { normalProfit, discountedProfit, extraSalesNeededPct: Math.round((normalProfit / discountedProfit - 1) * 1000) / 10, viable: true };
}
