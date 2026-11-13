// Static demo verdict shown to trial users on /ads/coach (never generated, never stored).
import type { CoachVerdict } from "./contracts";

export const SAMPLE_VERDICT: CoachVerdict = {
  summary: "One ad is carrying the account. Put more money behind it and switch off the two that only burn budget.",
  confidence: "medium",
  enoughData: true,
  waitDays: null,
  source: "table",
  ads: [
    { name: "Stop losing Saturday bookings", verdict: "keep", reason: "Cheapest bookings in the account and still climbing.", keyNumber: "$11.40 per booking" },
    { name: "Spring offer 20% off", verdict: "watch", reason: "People click, but few book yet. Give it 3 more days.", keyNumber: "2.1% CTR" },
    { name: "Meet the team video", verdict: "kill", reason: "Spent the most and brought one booking.", keyNumber: "$64 per booking" },
    { name: "Before / after carousel", verdict: "kill", reason: "The same people have seen it 4+ times; it's worn out.", keyNumber: "4.6x frequency" },
  ],
  actions: [
    { kind: "pause", text: "Switch off “Meet the team video” and “Before / after carousel” today." },
    { kind: "budget", text: "Move their budget to “Stop losing Saturday bookings”: about +$15 a day." },
    { kind: "creative", text: "Make 5 new ads on the same “empty Saturday” worry so the winner doesn't wear out." },
  ],
  winner: {
    name: "Stop losing Saturday bookings",
    angle: "Empty weekend slots cost real money",
    hook: "Another Saturday with three empty chairs?",
    headline: "Stop losing Saturday bookings",
    style: "Bold headline on a warm photo of the shop, one short line of proof",
    matchedAdId: null,
  },
};
