// founder_note: a short personal plain-text note from Nolan after the free ads are ready.
// Fixed copy (never the AI copywriter), no HTML, no images, no tracked links. Pure; the engine imports it.

export interface FounderNoteInput {
  firstName: string | null;
  brandName: string | null;
  readyAdCount: number;
  /** Plain (untracked) link to their run page. */
  runUrl: string | null;
  unsubscribeUrl: string;
}

export interface FounderNote {
  subject: string;
  text: string;
}

export const FOUNDER_FROM_DEFAULT = "Nolan from Komendly <nolan@komendly.com>";

export function founderFrom(env: string | undefined = typeof process !== "undefined" ? process.env.LIFECYCLE_FOUNDER_FROM : undefined): string {
  return env?.trim() || FOUNDER_FROM_DEFAULT;
}

export function founderNote(i: FounderNoteInput): FounderNote {
  const brand = i.brandName?.trim() || null;
  const n = i.readyAdCount;
  const ads = `${n} ${n === 1 ? "ad" : "ads"}`;
  const lines = [
    `Hi ${i.firstName?.trim() || "there"},`,
    "",
    `I'm Nolan, I built Komendly. I saw your ${ads}${brand ? ` for ${brand}` : ""} just finished, so I wanted to say hi personally.`,
    "",
    `Quick question: what are you hoping these ads do for ${brand ?? "you"}? More bookings, more sales, something else?`,
    "",
    "If you'd like, reply and I'll help you set up your first campaign. I read every reply myself.",
    ...(i.runUrl ? ["", `Your ads are here: ${i.runUrl}`] : []),
    "",
    "Nolan",
    "",
    "--",
    `Don't want these emails? Unsubscribe: ${i.unsubscribeUrl}`,
  ];
  return { subject: brand ? `your ${brand} ads` : "your komendly ads", text: lines.join("\n") };
}
