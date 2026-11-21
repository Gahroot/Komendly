// Engine runner for the shared review gate (src/lib/growth/review-gate.ts): AI reviewer on the engine's text provider,
// decisions logged as AdsEvent `review_gate`. Use: `await gate(db, provider, item, { revise })` before any send/publish.
import { reviewGate, type ReviewItem, type ReviewVerdict } from "../../../src/lib/growth/review-gate";
import type { AIProvider } from "../providers/types";

type GateDb = { adsEvent: { create(a: { data: { name: string; props: object } }): Promise<unknown> } };

export async function gate(
  db: GateDb,
  provider: Pick<AIProvider, "text">,
  item: ReviewItem,
  opts: { revise?: (item: ReviewItem, v: ReviewVerdict) => Promise<string | null> } = {},
) {
  return reviewGate((req) => provider.text({ ...req, reasoning: "medium" }), item, {
    revise: opts.revise,
    log: async (e) => { await db.adsEvent.create({ data: { name: "review_gate", props: e } }); },
  });
}
