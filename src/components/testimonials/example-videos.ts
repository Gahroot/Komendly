// Example testimonials made with the current pipeline (Happy Horse v1.1 native voice, iPhone finish).
// Files live in public/examples/<slug>.mp4 with a matching .jpg poster.
export interface ExampleVideo {
  slug: string;
  presenter: string;
  business: string;
  industry: string;
}

export const EXAMPLE_VIDEOS: ExampleVideo[] = [
  { slug: "dental-priya", presenter: "Priya", business: "Brightside Dental", industry: "Dental" },
];

export const HERO_EXAMPLE = EXAMPLE_VIDEOS[0];

export const exampleSrc = (slug: string) => `/examples/${slug}.mp4`;
export const examplePoster = (slug: string) => `/examples/${slug}.jpg`;
