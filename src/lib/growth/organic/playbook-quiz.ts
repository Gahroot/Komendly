// Interactive marketing playbook (/tools/marketing-playbook-quiz): 5 answers -> an ordered plan with links to the free tools.
// Budget guidance is a starting-test range, not a benchmark or a promise.
export type QuizGoal = "calls" | "bookings" | "online-sales" | "awareness";
export type QuizBudget = "none" | "small" | "medium" | "large";
export type QuizReviews = "none" | "some" | "many";
export interface QuizAnswers { trade: string; goal: QuizGoal; budget: QuizBudget; hasWebsite: boolean; reviews: QuizReviews; hoursPerWeek: 1 | 3 | 6 }
export interface PlanStep { title: string; why: string; href?: string; cta?: string }
export interface Plan { headline: string; testBudget: string; steps: PlanStep[] }

export const QUIZ_GOALS: ReadonlyArray<{ id: QuizGoal; label: string }> = [{ id: "calls", label: "More phone calls" }, { id: "bookings", label: "More bookings" }, { id: "online-sales", label: "More online orders" }, { id: "awareness", label: "More people knowing about us" }];
export const QUIZ_BUDGETS: ReadonlyArray<{ id: QuizBudget; label: string }> = [{ id: "none", label: "Nothing yet" }, { id: "small", label: "Up to $300 a month" }, { id: "medium", label: "$300 to $1,000 a month" }, { id: "large", label: "More than $1,000 a month" }];

const TEST_BUDGET: Record<QuizBudget, string> = {
  none: "Start with free work only: reviews, your Google Business profile and organic posts. No ad spend until you have a clear offer.",
  small: "Run one campaign with one or two ads, about $10 a day, for at least 7 days before judging it. This is a starting test, not a rule.",
  medium: "Run two or three different ads against each other in one campaign, around $15 to $30 a day, and keep the one customers respond to.",
  large: "Split the budget: most on the ad that is working, a smaller slice on new ads to test each week. Track cost per lead, not clicks.",
};

export function buildPlan(a: QuizAnswers): Plan {
  const steps: PlanStep[] = [];
  steps.push({ title: "Pick one offer", why: "An ad with one clear offer beats a general 'we do everything' ad.", href: "/tools/marketing-offer-generator", cta: "Generate offer ideas" });
  if (!a.hasWebsite) steps.push({ title: "Get a simple page people can act on", why: "Ads need somewhere to send people: a page with your phone number, services and a booking or quote button." });
  if (a.reviews === "none") steps.push({ title: "Ask your last 10 happy customers for a review", why: "Reviews are the proof most buyers look for before they call. Ask every customer, never only the happy ones." });
  else steps.push({ title: "Put your reviews inside your ads", why: "Real customer words are the best proof you have.", href: "/tools/testimonial-generator", cta: "Turn a review into an ad" });
  if (a.budget !== "none") {
    steps.push({ title: "Write ad copy that fits", why: "Short headline, one benefit, one call to action.", href: `/ad-copy-library/${a.trade}`, cta: "Browse copy for your trade" });
    steps.push({ title: "Make the ads in every size", why: "Feed, Stories and Reels each need their own crop.", href: "/tools/ad-image-resizer", cta: "Resize your image" });
    steps.push({ title: "Check what the budget can buy", why: "Do the maths before spending: cost per lead and break-even.", href: "/tools/ad-budget-calculator", cta: "Open the budget calculator" });
  }
  steps.push({ title: "Plan the year's busy moments", why: "Start ads early for each season, not on the day.", href: "/tools/marketing-calendar-generator", cta: "Build your calendar" });
  if (a.hoursPerWeek === 1) steps.push({ title: "Let someone else make the ads", why: "With about an hour a week, ready-made ads from your website save the most time.", href: "/free-ads", cta: "Get free ads from your website" });
  const goalLine: Record<QuizGoal, string> = { calls: "Your plan to get more phone calls", bookings: "Your plan to get more bookings", "online-sales": "Your plan to get more online orders", awareness: "Your plan to get known locally" };
  return { headline: goalLine[a.goal], testBudget: TEST_BUDGET[a.budget], steps };
}
