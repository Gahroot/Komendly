// "Launch on Meta in about 10 minutes": one source for the results-page guide, the ZIP's ad-text.txt and emails.
// Pure, no imports. Steps describe Meta Ads Manager as it works for a small business (no claims about results).

export interface GuideStep {
  title: string;
  text: string;
  /** Extra line for the ZIP's ad-text.txt only (the results page has a button instead). */
  fileNote?: string;
}

export const LAUNCH_GUIDE_STEPS: readonly GuideStep[] = [
  { title: "Download your ads", text: "Use Download all. The ZIP has every ad image plus ad-text.txt with the headline and text to paste for each ad." },
  { title: "Open Meta Ads Manager", fileNote: "Ads Manager: https://adsmanager.facebook.com", text: "Use the Open Meta Ads Manager button below and click Create. Pick Sales if people buy on your website, or Leads if they call, book or fill in a form." },
  { title: "Set a small budget", text: "Start with $10 to $20 a day. Set the location to where your customers are and leave Advantage+ audience on: Meta finds the people." },
  { title: "Add 3 to 5 ads", text: "In the same ad set, make one ad per image you like. Paste the matching headline and primary text from ad-text.txt, add your website link and pick a button like Learn more or Book now." },
  { title: "Wait, then keep the winner", text: "Let them run 3 to 4 days without edits. Then turn off the ads with the highest cost per result and keep the best one running. Add fresh ads next to it every few weeks so it doesn't wear out." },
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
    "HOW TO LAUNCH ON FACEBOOK + INSTAGRAM (about 10 minutes)",
    ...LAUNCH_GUIDE_STEPS.map((s, i) => `${i + 1}. ${s.title}: ${s.fileNote ? `${s.text.replace("Use the Open Meta Ads Manager button below", "Open Meta Ads Manager")} ${s.fileNote}` : s.text}`),
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
