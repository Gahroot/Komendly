import { FIRST_VIDEO_OFFER, formatUsd, GUARANTEE, UGC_CREATOR_RATE_USD, VIDEO_MAX_SECONDS, videosLabel } from "@/lib/first-video-offer";
import { plans } from "@/lib/pricing-plans";

const entry = plans[0];

export const TESTIMONIAL_FAQ: { q: string; a: string }[] = [
  { q: "How does it work?", a: "Paste a written review, pick a presenter and a length. We turn the review into a short script and an AI presenter says it to camera in their own natural voice, like a selfie video filmed on a phone. You get a vertical video you can download." },
  { q: `What's in the ${FIRST_VIDEO_OFFER.name}?`, a: `${videosLabel(FIRST_VIDEO_OFFER.minutes)}, up to ${VIDEO_MAX_SECONDS}s each, for ${formatUsd(FIRST_VIDEO_OFFER.priceCents)} once. ${FIRST_VIDEO_OFFER.bonuses.join(". ")}. No subscription.` },
  { q: "Why not hire a UGC creator?", a: `Typical creator rates run $${UGC_CREATOR_RATE_USD.low}–${UGC_CREATOR_RATE_USD.high} per testimonial video, plus briefing, shipping and waiting. Here the words come from reviews you already have, and the video is ready in minutes.` },
  { q: "What if I don't like the result?", a: GUARANTEE },
  { q: "Do my customers need to record anything?", a: "No. You use the reviews they've already written. Nobody has to go on camera." },
  { q: "Where can I post the videos?", a: "Anywhere: Instagram Reels, TikTok, YouTube Shorts, Facebook, your website. Videos are 9:16 MP4 files." },
  { q: "How long does a video take?", a: "Usually a few minutes. You'll see each clip finish as it renders, then the final video." },
  { q: "Is it honest to use an AI presenter?", a: "The words come from a real customer review. We recommend labelling the video as a dramatised review, and never inventing reviews." },
  { q: `What happens after my ${FIRST_VIDEO_OFFER.name}?`, a: entry ? `Nothing automatic. To turn every new 5-star review into a video, ${entry.name} is $${entry.monthlyPrice}/month for ${entry.minutes} videos. Or stop there.` : "Nothing automatic." },
];
