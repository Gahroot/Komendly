// Support knowledge base (docs/ops/support-kb.md mirrors it). Pure: facts come from public-offer.ts / billing-config.ts,
// so a price or guarantee change shows up here. kbAnswer(question) is deterministic (no AI): the auto-responder uses it
// before asking the model. Never promise leads, sales or results; refunds are described, never granted here.
import { GUARANTEE_DAYS } from "../ads/billing-config";
import { AD_SPEND_LINE, FREE_PACK_LINE, HERO_PRICE_LINE, NO_GUARANTEE_LINE, PUBLIC_OFFER, UNLOCK_LINE } from "../ads/public-offer";

export interface KbEntry { id: string; title: string; match: RegExp[]; answer: string }

export const KB: readonly KbEntry[] = [
  { id: "download", title: "Downloading your ads", match: [/download/i, /save (my|the) ads?/i, /get (my|the) ads?/i],
    answer: `Open your pack from your Komendly dashboard and use the Download button on each ad. ${FREE_PACK_LINE}; some ads in a pack stay locked until you unlock it. If a download fails for an ad that is unlocked, reply with the email you signed up with and we will fix it.` },
  { id: "locked", title: "Locked ads", match: [/locked/i, /unlock/i, /rest of (the|my) (pack|ads)/i, /blurred|watermark/i],
    answer: `${UNLOCK_LINE}. After that, every ad in that pack is downloadable.` },
  { id: "billing", title: "Charges and billing", match: [/\b(charged|charge|invoice|receipt|billing|billed)\b/i, /how much|pricing|price|cost/i],
    answer: `${HERO_PRICE_LINE}. Do-it-yourself: ${PUBLIC_OFFER.diyName} is ${PUBLIC_OFFER.diyPrice}/month. ${AD_SPEND_LINE} Your receipts are emailed by Stripe and listed under Billing in your account.` },
  { id: "refund", title: "Refunds", match: [/refund/i, /money back/i, /guarantee/i],
    answer: `There is a ${GUARANTEE_DAYS}-day refund guarantee on your first payment: you can use "Refund my first payment" under Billing, or reply and say why it did not work for you. ${NO_GUARANTEE_LINE}` },
  { id: "meta_setup", title: "Connecting Meta", match: [/\bmeta\b/i, /facebook (page|ad account|business)/i, /instagram/i, /ad account/i, /business manager|partner access/i],
    answer: "For the done-for-you plan we set up your Meta connection with you: you give partner access to your Page and ad account from Meta Business Settings, and we never see your password. If you are stuck on a step, reply with a screenshot of where you are and we will walk you through it. Ad spend always stays in your own Meta account." },
  { id: "cancel", title: "Cancelling", match: [/cancel/i, /stop (my|the) (subscription|plan|billing)/i, /unsubscribe from (the )?(plan|subscription)/i],
    answer: "You can cancel any time under Billing in your account; the plan then stays active until the end of the period you paid for. Cancelling does not delete your ads." },
  { id: "free_pack", title: "The free pack", match: [/free (ads?|pack|trial)/i, /how many ads/i, /no card/i],
    answer: `${FREE_PACK_LINE}. Paste your website link on the Komendly home page and the ads are made from your own site.` },
  { id: "results", title: "Results and leads", match: [/will (it|this) (really )?work/i, /guarantee.*(leads|sales|results)/i, /how many (leads|sales|customers)/i],
    answer: `${NO_GUARANTEE_LINE} What we do guarantee is the work: fresh ads made from your website, and for the done-for-you plan, ads launched and watched for you.` },
];

export interface KbHit { id: string; title: string; answer: string; score: number }

/** Best KB answer for a customer's question, or null when nothing matches well enough (then a person or the AI decides). */
export function kbAnswer(question: string): KbHit | null {
  const q = (question ?? "").slice(0, 3000);
  if (!q.trim()) return null;
  let best: KbHit | null = null;
  for (const e of KB) {
    const score = e.match.filter((re) => re.test(q)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: e.id, title: e.title, answer: e.answer, score };
  }
  return best;
}

/** docs/ops/support-kb.md body, generated from KB so the doc cannot drift. */
export function kbMarkdown(): string {
  return ["# Support knowledge base", "", "Generated from `src/lib/ops/kb.ts` (`kbAnswer(question)`). Edit the code, then regenerate with `npx tsx -e \"import('./src/lib/ops/kb').then(m=>console.log(m.kbMarkdown()))\" > docs/ops/support-kb.md`.", "", ...KB.flatMap((e) => [`## ${e.title} (\`${e.id}\`)`, "", e.answer, ""])].join("\n");
}
