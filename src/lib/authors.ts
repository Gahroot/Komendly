import { SITE_URL } from "./site";

export interface Author {
  slug: string;
  name: string;
  jobTitle: string;
  /** Short bio. Only facts that are true and checkable: no invented credentials or numbers. */
  bio: string;
  image?: string;
  /** Profile URLs (LinkedIn, X, GitHub...). Fill in to strengthen the Person entity. */
  sameAs: string[];
}

export const AUTHORS: readonly Author[] = [
  {
    slug: "nolan-grout",
    name: "Nolan Grout",
    jobTitle: "Founder, Komendly",
    bio: "Nolan Grout is the founder of Komendly. He builds Ozzy, Komendly's AI ad wizard that turns a website into on-brand, ready-to-run static and animated ads, and Komendly's AI video testimonials, which turn written customer reviews into AI-avatar videos.",
    sameAs: ["https://www.linkedin.com/in/nolangrout", "https://x.com/naGroot", "https://prestyj.com/about", "https://github.com/Gahroot"],
  },
];

export const DEFAULT_AUTHOR_SLUG = "nolan-grout";

/** Legacy/placeholder bylines that map to the default author. */
const ALIASES: Record<string, string> = { "komendly team": DEFAULT_AUTHOR_SLUG, komendly: DEFAULT_AUTHOR_SLUG };

export function getAuthorBySlug(slug: string): Author | undefined {
  return AUTHORS.find((a) => a.slug === slug);
}

/** Resolve a frontmatter `author` (name, slug or missing) to a registered author; unknown names fall back to the default. */
export function resolveAuthor(name: string | undefined | null): Author {
  const key = (name ?? "").trim().toLowerCase();
  const found = AUTHORS.find((a) => a.name.toLowerCase() === key || a.slug === key) ?? getAuthorBySlug(ALIASES[key] ?? DEFAULT_AUTHOR_SLUG);
  if (!found) throw new Error("default author missing from AUTHORS");
  return found;
}

export function authorPath(author: Author): string {
  return `/blog/author/${author.slug}`;
}

export function authorUrl(author: Author): string {
  return `${SITE_URL}${authorPath(author)}`;
}
