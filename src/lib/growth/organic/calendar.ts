// Seasonal marketing calendar per trade (pure). Dates follow US rules (Mother's Day = 2nd Sunday of May, etc.). The notes
// come from the hand-written trade playbooks and season definitions; nothing here is a statistic.
import { PLAYBOOKS, SEASONS, type Playbook, type SeasonKey } from "../trade-playbooks-data";

export interface CalendarEvent { key: SeasonKey; name: string; date: string; startAds: string; note: string; tradeIdea: string | null }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
/** nth (1-based) given weekday (0=Sun) of a month. */
export function nthWeekday(y: number, month: number, weekday: number, n: number): Date {
  const first = utc(y, month, 1);
  return addDays(first, ((weekday - first.getUTCDay() + 7) % 7) + (n - 1) * 7);
}

/** Date of each event and how many days before it ads should start (from the season timing guidance). */
export function eventDates(y: number): Array<{ key: SeasonKey; date: Date; lead: number }> {
  const rows: Array<{ key: SeasonKey; date: Date; lead: number }> = [
    { key: "new-year", date: utc(y, 1, 1), lead: 6 },
    { key: "tax-season", date: utc(y, 1, 27), lead: 0 },
    { key: "valentines-day", date: utc(y, 2, 14), lead: 14 },
    { key: "spring", date: utc(y, 3, 1), lead: 14 },
    { key: "mothers-day", date: nthWeekday(y, 5, 0, 2), lead: 14 },
    { key: "summer", date: utc(y, 5, 25), lead: 14 },
    { key: "back-to-school", date: utc(y, 8, 15), lead: 21 },
    { key: "fall", date: utc(y, 9, 1), lead: 0 },
    { key: "black-friday", date: addDays(nthWeekday(y, 11, 4, 4), 1), lead: 8 },
    { key: "holiday-season", date: utc(y, 11, 1), lead: 0 },
    { key: "winter", date: utc(y, 12, 1), lead: 10 },
  ];
  return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function buildCalendar(tradeSlug: string, year: number): CalendarEvent[] {
  const p: Playbook | undefined = PLAYBOOKS.find((x) => x.slug === tradeSlug);
  if (!p) return [];
  return eventDates(year).map(({ key, date, lead }) => {
    const s = SEASONS.find((x) => x.key === key)!;
    return { key, name: s.name, date: iso(date), startAds: iso(addDays(date, -lead)), note: s.timing, tradeIdea: p.seasonal[key] ?? null };
  });
}

/** Events that have a trade-specific idea come first in a "best fit" view. */
export const relevantEvents = (events: CalendarEvent[]) => events.filter((e) => e.tradeIdea);

const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;
export function calendarCsv(events: CalendarEvent[]): string {
  return ["Event,Date,Start ads on,When to start,Idea for your trade", ...events.map((e) => [e.name, e.date, e.startAds, e.note, e.tradeIdea ?? ""].map(csvCell).join(","))].join("\r\n") + "\r\n";
}
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
/** All-day "start ads" reminders as an .ics file (opens in Google/Apple/Outlook calendar). */
export function calendarIcs(events: CalendarEvent[], tradeLabel: string): string {
  const stamp = "20260101T000000Z";
  const body = events.flatMap((e) => {
    const d = e.startAds.replace(/-/g, "");
    const end = iso(addDays(new Date(`${e.startAds}T00:00:00Z`), 1)).replace(/-/g, "");
    return ["BEGIN:VEVENT", `UID:${e.key}-${d}@komendly.com`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${end}`, `SUMMARY:${icsText(`Start ${e.name} ads (${tradeLabel})`)}`, `DESCRIPTION:${icsText(`${e.name} is ${e.date}. ${e.note}${e.tradeIdea ? ` Idea: ${e.tradeIdea}` : ""}`)}`, "END:VEVENT"];
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Komendly//Marketing calendar//EN", ...body, "END:VCALENDAR"].join("\r\n") + "\r\n";
}
