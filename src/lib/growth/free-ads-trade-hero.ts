// Server-side hero data for /free-ads/<trade>, reusing the hand-written playbooks (trade-playbooks-data.ts).
import { freeAdsTrade, type FreeAdsTrade } from "./free-ads-trades";
import { playbook } from "./trade-playbooks";

/** Page hero data for a generated trade page: headline, three honest "what you get" hooks from the playbook. */
export function tradeHero(slug: string): { trade: FreeAdsTrade; hooks: string[]; services: string[] } | null {
  const trade = freeAdsTrade(slug);
  const p = playbook(slug);
  if (!trade || !p) return null;
  return { trade, hooks: p.hooks.slice(0, 3), services: p.services.slice(0, 3) };
}
