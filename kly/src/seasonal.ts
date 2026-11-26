// Seasonal opportunity: a calendar of niche peaks. N weeks before a peak starts the niche is "in window": its leads get
// a seasonal signal (score boost via signals.ts) and the segment picker favours it; copy gets a `seasonal_hook`.
// Pure: no I/O. The hook is a calendar fact about the trade, never a claim about the recipient.
import { type LeadSignal } from "./signals";

export interface SeasonalPeak {
  id: string;
  /** Regex tested on the Kly niche name. */
  niche: RegExp;
  /** Peak start, 1-based month and day. */
  month: number;
  day: number;
  /** Weeks before the peak the window opens. */
  leadWeeks: number;
  /** Weeks the peak itself lasts (window stays open until it ends). */
  lengthWeeks: number;
  /** Sentence for copy generation (true of the calendar, <= 20 words). */
  hook: string;
}

export const SEASONAL_PEAKS: readonly SeasonalPeak[] = [
  { id: "roof_storm", niche: /roof|gutter|window|siding/, month: 4, day: 1, leadWeeks: 6, lengthWeeks: 12, hook: "Spring storm season is when roofing and gutter calls spike." },
  { id: "roof_fall", niche: /roof|gutter/, month: 9, day: 15, leadWeeks: 5, lengthWeeks: 8, hook: "Fall is the last window before winter for roof and gutter work." },
  { id: "hvac_summer", niche: /hvac|heating|air/, month: 6, day: 1, leadWeeks: 6, lengthWeeks: 12, hook: "AC tune-ups and replacements peak once summer heat arrives." },
  { id: "hvac_winter", niche: /hvac|heating|air/, month: 11, day: 15, leadWeeks: 6, lengthWeeks: 12, hook: "Furnace tune-ups and no-heat calls peak when winter hits." },
  { id: "tax_season", niche: /account|tax|bookkeep/, month: 1, day: 15, leadWeeks: 6, lengthWeeks: 13, hook: "Tax season is when new clients look for an accountant." },
  { id: "holiday_retail", niche: /boutique|jewel|florist|furniture|bakeri|restaurant|cafe|gift/, month: 11, day: 15, leadWeeks: 6, lengthWeeks: 6, hook: "The holiday gift season is the busiest stretch for local retail." },
  { id: "valentines", niche: /florist|jewel|restaurant|bakeri|med spa|spa|salon/, month: 2, day: 1, leadWeeks: 4, lengthWeeks: 2, hook: "Valentine's Day drives gift, dinner and pampering bookings." },
  { id: "mothers_day", niche: /florist|jewel|restaurant|bakeri|med spa|spa|salon|boutique/, month: 5, day: 1, leadWeeks: 4, lengthWeeks: 2, hook: "Mother's Day drives gift, brunch and spa bookings." },
  { id: "back_to_school", niche: /tutor|dentist|orthodont|optometr|boutique|dance|martial|barber|hairdress|photograph/, month: 8, day: 1, leadWeeks: 5, lengthWeeks: 5, hook: "Back-to-school is when families book check-ups, classes and haircuts." },
  { id: "wedding_season", niche: /wedding|photograph|florist|bakeri|venue|jewel/, month: 5, day: 15, leadWeeks: 8, lengthWeeks: 20, hook: "Wedding season bookings start well before the dates." },
  { id: "new_year_fitness", niche: /gym|yoga|fitness|martial|personal/, month: 1, day: 1, leadWeeks: 5, lengthWeeks: 6, hook: "New Year is the biggest sign-up month for gyms and studios." },
  { id: "summer_body", niche: /med spa|gym|plastic|laser|fitness/, month: 5, day: 1, leadWeeks: 6, lengthWeeks: 10, hook: "Spring is when people book body and skin treatments before summer." },
  { id: "pool_season", niche: /pool|landscap|lawn|fence|concrete|paint|tree/, month: 4, day: 15, leadWeeks: 6, lengthWeeks: 16, hook: "Outdoor projects get booked as spring warms up." },
  { id: "pest_summer", niche: /pest/, month: 5, day: 1, leadWeeks: 5, lengthWeeks: 16, hook: "Pest calls climb as the weather warms." },
  { id: "moving_summer", niche: /moving|mover|junk|real estate|mortgage/, month: 5, day: 15, leadWeeks: 5, lengthWeeks: 16, hook: "Summer is peak moving and home-buying season." },
  { id: "auto_winter", niche: /auto|car/, month: 10, day: 15, leadWeeks: 5, lengthWeeks: 10, hook: "Winter prep (tires, batteries, brakes) peaks in late fall." },
  { id: "solar_summer", niche: /solar/, month: 3, day: 15, leadWeeks: 6, lengthWeeks: 16, hook: "Solar quotes pick up as electricity bills rise in summer." },
];

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Peak start in `year` (UTC). */
const peakStart = (p: SeasonalPeak, year: number) => new Date(Date.UTC(year, p.month - 1, p.day));

export interface ActivePeak { peak: SeasonalPeak; peakStarts: Date; weeksToPeak: number; inPeak: boolean }

/** Peaks whose window (peak start - leadWeeks .. peak end) contains `now`, for a niche. Soonest peak first. */
export function activePeaks(niche: string, now: Date): ActivePeak[] {
  const n = niche.toLowerCase();
  const out: ActivePeak[] = [];
  for (const peak of SEASONAL_PEAKS) {
    if (!peak.niche.test(n)) continue;
    for (const year of [now.getUTCFullYear() - 1, now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
      const start = peakStart(peak, year);
      const open = addDays(start, -peak.leadWeeks * 7);
      const end = addDays(start, peak.lengthWeeks * 7);
      if (now >= open && now <= end) {
        out.push({ peak, peakStarts: start, weeksToPeak: Math.max(0, Math.ceil((start.getTime() - now.getTime()) / (7 * 86_400_000))), inPeak: now >= start });
        break;
      }
    }
  }
  return out.sort((a, b) => a.weeksToPeak - b.weeksToPeak);
}

/** Priority multiplier for a niche today (1 = none; 1.5 = a peak is within its lead window or running). */
export function seasonalPriority(niche: string, now: Date): number {
  return activePeaks(niche, now).length ? 1.5 : 1;
}

/** The `seasonal` signal for a niche, or null. The opener is null: the hook goes to copy generation, not into a claim. */
export function seasonalSignal(niche: string, now: Date): LeadSignal | null {
  const a = activePeaks(niche, now)[0];
  if (!a) return null;
  return {
    kind: "seasonal", source: "calendar", opener: null, hook: a.peak.hook, detectedAt: now.toISOString(),
    evidence: `${a.peak.id}: ${a.inPeak ? "peak running" : `peak starts in ${a.weeksToPeak} week(s)`}`,
  };
}
