import type { Awareness } from "@/lib/ads/contracts";

/** Ozzy Studio example videos: public/studio-examples/<id>.mp4 (9:16) with a matching .jpg poster. `start` = seconds to skip. */
export interface StudioExample {
  id: string;
  label: string;
  start?: number;
}

export const STUDIO_EXAMPLES: readonly StudioExample[] = [
  { id: "ozzy-v07", label: "Ozzy Studio: “Their ad moves”", start: 0 },
  { id: "dessert", label: "Dessert shop: “Cookies AND ice cream”" },
  { id: "ad08", label: "Komendly: “What do I even say?”", start: 0 },
  { id: "plumber", label: "Plumber: “Leaking again?”" },
  { id: "landscaper", label: "Landscaper: “More than mowing”" },
  { id: "ad43", label: "Komendly: “Hours on one ad”", start: 5 },
  { id: "roofer", label: "Roofer: “My roof’s leaking”" },
  { id: "ozzy-v10", label: "Ozzy Studio: “Can’t edit video?”", start: 7 },
  { id: "dentist", label: "Dentist: “I keep putting it off”" },
  { id: "ad53", label: "Komendly: “That’s why we built this”", start: 9 },
];

export const studioExampleSrc = (ex: StudioExample) => `/studio-examples/${ex.id}.mp4${ex.start ? `#t=${ex.start}` : ""}`;
export const studioExamplePoster = (ex: StudioExample) => `/studio-examples/${ex.id}.jpg`;

/** Real composed static ads (Ad Packs) from live runs, saved in public/ads/samples. */
export interface AdSample {
  src: string;
  awareness: Awareness;
  angle: string;
  alt: string;
  tilt: string;
}

export const AD_SAMPLES: readonly AdSample[] = [
  { src: "/ads/samples/maxteriors-ad-0.jpg", awareness: "problem_aware", angle: "Wanting holiday lights without another climb up the ladder", alt: "Maxteriors ad: I want the lights, not another trip up the ladder", tilt: "-0.6deg" },
  { src: "/ads/samples/yaatuber-ad-6.jpg", awareness: "problem_aware", angle: "Realizing the important click is hard for viewers to see", alt: "Yaatuber ad: One tiny click. More editing.", tilt: "0.5deg" },
  { src: "/ads/samples/maxteriors-ad-8.jpg", awareness: "solution_aware", angle: "Relief when the installation is no longer your unfinished job", alt: "Maxteriors ad: Your Govee lights are finally out of the box.", tilt: "-0.4deg" },
  { src: "/ads/samples/yaatuber-ad-4.jpg", awareness: "problem_aware", angle: "Hesitating to commit to audio cleanup without hearing it", alt: "Yaatuber ad: Can I hear the cleanup before I commit?", tilt: "0.6deg" },
  { src: "/ads/samples/maxteriors-ad-4.jpg", awareness: "problem_aware", angle: "Holiday decorating turning into untangling work", alt: "Maxteriors ad: You planned to decorate, not untangle lights", tilt: "-0.5deg" },
  { src: "/ads/samples/yaatuber-ad-8.jpg", awareness: "solution_aware", angle: "Wanting to focus on teaching rather than planning zoom edits", alt: "Yaatuber ad: Keep your mind on what you're teaching.", tilt: "0.4deg" },
];
