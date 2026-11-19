import { describe, expect, it } from "vitest";
import type { AIProvider } from "../providers/types";
import { runToolJob } from "./free-tools";

/** Provider that answers each call with the next canned JSON and records prompts. */
function fake(answers: unknown[]) {
  const prompts: string[] = [];
  const provider = {
    text: async (req: { prompt: string }) => {
      prompts.push(req.prompt);
      return { text: "", json: answers.shift(), usage: {} };
    },
  } as unknown as AIProvider;
  return { provider, prompts };
}

const h = (text: string, pin = "none") => ({ text, pin });
const good = Array.from({ length: 15 }, (_, i) => h(`Leeds Plumber Deal ${i + 1}`));

describe("free tool jobs through structured()", () => {
  it("RSA: drops over-length headlines without cutting words", async () => {
    const { provider } = fake([{ headlines: [...good, h("This headline is far too long for Google Ads")], descriptions: [h("Call today for a fixed price.", "none"), h("Local for 20 years. Book online.")], paths: ["plumber", "leeds emergency"] }]);
    const r = (await runToolJob(provider, { id: "j", tool: "google-ads-headline-generator", input: { business: "Plumber in Leeds, 24/7", keywords: "plumber leeds" } })) as { headlines: Array<{ text: string }>; paths: string[] };
    expect(r.headlines).toHaveLength(15);
    expect(r.headlines.every((x) => x.text.length <= 30 && !x.text.includes("…"))).toBe(true);
    expect(r.paths).toEqual(["plumber", "leeds-emergency"]);
  });
  it("RSA: regenerates when too few fit, then rejects", async () => {
    const tooLong = { headlines: Array.from({ length: 10 }, (_, i) => h(`Headline number ${i} that runs well past thirty`)), descriptions: [h("ok description, call now."), h("another one, book today.")], paths: [] };
    const { provider, prompts } = fake([tooLong, { headlines: good, descriptions: tooLong.descriptions, paths: [] }]);
    const r = (await runToolJob(provider, { id: "j", tool: "google-ads-headline-generator", input: { business: "Plumber in Leeds, 24/7", keywords: "plumber" } })) as { headlines: unknown[] };
    expect(r.headlines).toHaveLength(15);
    expect(prompts[1]).toContain("30 characters or fewer");
    await expect(runToolJob(fake([tooLong, tooLong]).provider, { id: "j", tool: "google-ads-headline-generator", input: { business: "Plumber in Leeds", keywords: "plumber" } })).rejects.toThrow(/schema/);
  });
  it("LinkedIn: only LinkedIn CTA buttons and intros that fit before 'see more'", async () => {
    const v = (intro: string, cta = "Request Demo") => ({ angle: "Outcome", intro, headline: "Payroll in 15 minutes", description: "For UK teams of 10-200", cta });
    const { provider } = fake([{ variants: [v("Run UK payroll in 15 minutes."), v("x".repeat(151)), v("Finance teams: stop retyping timesheets.")] }]);
    const r = (await runToolJob(provider, { id: "j", tool: "linkedin-ad-copy-generator", input: { offer: "Payroll software for UK companies" } })) as { variants: unknown[] };
    expect(r.variants).toHaveLength(2);
    await expect(runToolJob(fake([{ variants: [v("a", "Buy Now"), v("b", "Buy Now")] }, { variants: [v("a", "Buy Now"), v("b", "Buy Now")] }]).provider, { id: "j", tool: "linkedin-ad-copy-generator", input: { offer: "Payroll software for UK companies" } })).rejects.toThrow();
  });
  it("UGC script: prompt carries the length and the result validates", async () => {
    const script = { angle: "Problem-solution", hook: "My phone kept flying off the dash.", scenes: [{ time: "0-3s", shot: "Selfie in car", onScreen: "Phone mount fail?", voiceover: "My phone kept flying off." }, { time: "3-15s", shot: "Snap phone onto mount", onScreen: "One hand. Done.", voiceover: "Now it just clicks on." }], cta: "Tap Shop Now" };
    const { provider, prompts } = fake([{ scripts: [script, { ...script, angle: "Demo" }] }]);
    const r = (await runToolJob(provider, { id: "j", tool: "ugc-script-generator", input: { product: "Magnetic car phone mount", length: "15" } })) as { scripts: unknown[] };
    expect(r.scripts).toHaveLength(2);
    expect(prompts[0]).toContain("15 seconds");
  });
});
