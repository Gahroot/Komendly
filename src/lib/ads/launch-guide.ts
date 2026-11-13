// "Post your ads on Meta in 5 minutes": one source for the results-page guide, the billing page (Ad Department),
// the ZIP's ad-text.txt and emails. Pure, no imports. Steps describe Meta Ads Manager as it works for a small
// business; no promises about results.

export interface GuideStep {
  title: string;
  text: string;
  /** Extra line for the ZIP's ad-text.txt only (the results page has a button instead). */
  fileNote?: string;
}

export const LAUNCH_GUIDE_TITLE = "Post your ads on Meta in 5 minutes";

export const LAUNCH_GUIDE_STEPS: readonly GuideStep[] = [
  { title: "Download your ads", text: "Use Download all. The ZIP has every ad image plus ad-text.txt with the headline and text to paste for each ad." },
  { title: "Open Meta Ads Manager", fileNote: "Ads Manager: https://adsmanager.facebook.com", text: "Use the Open Meta Ads Manager button below and click Create. Pick Sales if people buy on your website. Pick Leads if they call, book or fill in a form." },
  { title: "Set budget and audience", text: "Budget: $10 to $20 a day on the ad set. Location: where your customers are. Leave Advantage+ audience and Advantage+ placements on. Meta finds the right people for you." },
  { title: "Add 3 to 5 ads", text: "One ad per image you like, all in the same ad set. Paste the headline and text from ad-text.txt, add your website link, pick a button like Shop now or Book now, then Publish." },
  { title: "Wait 4 days, then keep the winner", text: "Don't touch anything for 4 days, even if day 1 looks slow. Then turn off the ads that cost the most per result and keep the best one running. Add fresh ads next to it every week." },
];

/** Which size goes where (Meta picks the placement; uploading both sizes lets each spot use the right one). */
export const LAUNCH_GUIDE_SIZES: readonly { ratio: string; where: string }[] = [
  { ratio: "4:5", where: "Facebook and Instagram feeds (use this one if you upload only one size)" },
  { ratio: "9:16", where: "Stories and Reels: add it with Customize placements, or upload it as the second size" },
  { ratio: "1:1", where: "Fine everywhere in the feed, and the right panel on Facebook" },
];

/** What "good" looks like after 4 days, in plain words. */
export const LAUNCH_GUIDE_GOOD: readonly string[] = [
  "Click-through rate (CTR) above 1% means people like the ad.",
  "Cost per click under $1.50 is a healthy start for most small businesses.",
  "The real test: cost per sale or lead lower than what a customer is worth to you.",
  "No sales yet after 4 days at $10 a day is normal. Keep the best ad, add new ones, give it another week.",
];

export interface AdText {
  files: string[];
  headline: string;
  body: string | null;
  cta: string | null;
}

/** ad-text.txt for the ZIP: the guide, then each ad's copy next to its file names. */
export function adTextFile(brand: string, ads: AdText[]): string {
  const lines = [
    `Your ads for ${brand}, made by Komendly`,
    "",
    `${LAUNCH_GUIDE_TITLE.toUpperCase()} (Facebook + Instagram)`,
    ...LAUNCH_GUIDE_STEPS.map((s, i) => `${i + 1}. ${s.title}: ${s.fileNote ? `${s.text.replace("Use the Open Meta Ads Manager button below", "Open Meta Ads Manager")} ${s.fileNote}` : s.text}`),
    "",
    "WHICH SIZE GOES WHERE",
    ...LAUNCH_GUIDE_SIZES.map((z) => `- ${z.ratio}: ${z.where}`),
    "",
    "WHAT GOOD LOOKS LIKE AFTER 4 DAYS",
    ...LAUNCH_GUIDE_GOOD.map((g) => `- ${g}`),
    "",
    "AD TEXT (paste into Meta next to the matching image)",
  ];
  for (const ad of ads) {
    if (!ad.files.length) continue;
    lines.push("", `--- ${ad.files.join(", ")}`, `Headline: ${ad.headline}`);
    if (ad.body) lines.push(`Primary text: ${ad.body}`);
    if (ad.cta) lines.push(`Button idea: ${ad.cta}`);
  }
  return `${lines.join("\r\n")}\r\n`;
}
