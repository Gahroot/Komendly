import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import readingTime from 'reading-time'
import { resolveAuthor } from './authors'

const BLOG_DIR = path.join(process.cwd(), 'content/blog')

export const POST_TYPES = ['guide', 'comparison', 'alternatives', 'question', 'listicle', 'glossary'] as const
export type PostType = (typeof POST_TYPES)[number]
export type PostCta = 'ads' | 'motion'

export interface FaqItem {
  q: string
  a: string
}

export interface PostSource {
  id: number
  title: string
  publisher?: string
  url: string
  /** ISO date (YYYY-MM-DD) */
  accessed?: string
}

export interface BlogPostMeta {
  slug: string
  title: string
  description: string
  /** ISO timestamp, first published */
  date: string
  /** ISO timestamp, last meaningful update (falls back to `date`) */
  updated: string
  /** Display name of the resolved author */
  author: string
  authorSlug: string
  image?: string
  tags: string[]
  published: boolean
  readingTime: string
  type: PostType
  answer?: string
  keyTakeaways: string[]
  competitors: string[]
  cta: PostCta
  faq: FaqItem[]
  sources: PostSource[]
  primaryKeyword?: string
  secondaryKeywords: string[]
}

export interface BlogPost extends BlogPostMeta {
  content: string
}

/** Blog hubs grouping post types. */
export const CATEGORIES = [
  {
    slug: 'comparisons',
    name: 'Comparisons',
    types: ['comparison', 'alternatives'] as PostType[],
    intro:
      'Side-by-side comparisons of AI ad generators and creative tools, and the best alternatives to popular ones. Prices and features are taken from each vendor’s own pages, with sources and the date we checked.',
  },
  {
    slug: 'guides',
    name: 'Guides',
    types: ['guide', 'listicle', 'glossary'] as PostType[],
    intro:
      'Practical guides to ad creative, Meta (Facebook and Instagram) ads and marketing for small businesses, plus video testimonials and social proof.',
  },
  {
    slug: 'questions',
    name: 'Questions',
    types: ['question'] as PostType[],
    intro: 'Short, direct answers to the questions small businesses ask about ads, ad creative and social proof.',
  },
] as const

export type Category = (typeof CATEGORIES)[number]

export function getCategory(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug)
}

export function categoryForType(type: PostType): Category {
  return CATEGORIES.find((c) => c.types.includes(type)) ?? CATEGORIES[1]
}

// ---------- parsing (pure) ----------

function str(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined
  if (typeof v === 'number') return String(v)
  return undefined
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map(str).filter((s): s is string => Boolean(s))
}

/** YAML dates arrive as Date objects (unquoted) or strings (quoted). Returns an ISO timestamp or undefined. */
export function toIsoDate(v: unknown): string | undefined {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v.toISOString()
  const s = str(v)
  if (!s) return undefined
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

function parseType(v: unknown): PostType {
  const s = str(v)?.toLowerCase()
  return (POST_TYPES as readonly string[]).includes(s ?? '') ? (s as PostType) : 'guide'
}

function parseFaq(v: unknown): FaqItem[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const rec = item as Record<string, unknown>
    const q = str(rec.q ?? rec.question)
    const a = str(rec.a ?? rec.answer)
    return q && a ? [{ q, a }] : []
  })
}

function parseSources(v: unknown): PostSource[] {
  if (!Array.isArray(v)) return []
  const out = v.flatMap((item, i) => {
    if (!item || typeof item !== 'object') return []
    const rec = item as Record<string, unknown>
    const url = str(rec.url)
    const title = str(rec.title)
    if (!url || !title) return []
    const id = Number(rec.id ?? i + 1)
    const accessed = toIsoDate(rec.accessed)?.slice(0, 10)
    return [{ id: Number.isFinite(id) ? id : i + 1, title, publisher: str(rec.publisher), url, accessed }]
  })
  return out.sort((a, b) => a.id - b.id)
}

/** Turn raw frontmatter + body into post data. `now` is only used when a post has no date at all. */
export function parsePost(slug: string, data: Record<string, unknown>, content: string, now: Date = new Date()): BlogPost {
  // Legacy posts use `publishDate` or only a YYYY-MM-DD filename prefix
  const date = toIsoDate(data.date) ?? toIsoDate(data.publishDate) ?? toIsoDate(/^\d{4}-\d{2}-\d{2}/.exec(slug)?.[0]) ?? now.toISOString()
  const author = resolveAuthor(str(data.author))
  return {
    slug,
    title: str(data.title) ?? slug,
    description: str(data.description) ?? '',
    date,
    updated: toIsoDate(data.updated) ?? date,
    author: author.name,
    authorSlug: author.slug,
    image: str(data.image),
    tags: strList(data.tags),
    published: data.published !== false,
    readingTime: readingTime(content).text,
    type: parseType(data.type),
    answer: str(data.answer),
    keyTakeaways: strList(data.key_takeaways),
    competitors: strList(data.competitors),
    cta: str(data.cta) === 'motion' ? 'motion' : 'ads',
    faq: parseFaq(data.faq),
    sources: parseSources(data.sources),
    primaryKeyword: str(data.primary_keyword),
    secondaryKeywords: strList(data.secondary_keywords),
    content,
  }
}

export function parsePostFile(slug: string, raw: string, now?: Date): BlogPost {
  const { data, content } = matter(raw)
  return parsePost(slug, data, content, now)
}

function toMeta(post: BlogPost): BlogPostMeta {
  const { content: _content, ...meta } = post
  void _content
  return meta
}

// ---------- file access ----------

function postFiles(): string[] {
  if (!fs.existsSync(BLOG_DIR)) return []
  return fs
    .readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith('.mdx') || file.endsWith('.md'))
    .sort()
}

function readPost(file: string): BlogPost {
  const slug = file.replace(/\.mdx?$/, '')
  return parsePostFile(slug, fs.readFileSync(path.join(BLOG_DIR, file), 'utf-8'))
}

/** All published posts (metadata only), newest first. */
export function getBlogPosts(): BlogPostMeta[] {
  return postFiles()
    .map(readPost)
    .filter((post) => post.published)
    .map(toMeta)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || a.slug.localeCompare(b.slug))
}

/** A single published post with content, or null (missing or draft). */
export function getBlogPost(slug: string): BlogPost | null {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return null
  const file = [`${slug}.mdx`, `${slug}.md`].find((f) => fs.existsSync(path.join(BLOG_DIR, f)))
  if (!file) return null
  const post = readPost(file)
  return post.published ? post : null
}

/** Slugs of published posts, for static generation. */
export function getBlogSlugs(): string[] {
  return getBlogPosts().map((p) => p.slug)
}

/** Tag pages with fewer posts than this are thin: noindex and kept out of the sitemap. */
export const MIN_INDEXABLE_TAG_POSTS = 2

/** URL-safe tag slug: "Video Testimonials" -> "video-testimonials". */
export function tagSlug(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function getBlogPostsByTag(slug: string): BlogPostMeta[] {
  const wanted = tagSlug(decodeURIComponent(slug))
  return getBlogPosts().filter((post) => post.tags.some((t) => tagSlug(t) === wanted))
}

/** Unique tags (first-seen spelling per slug), sorted. */
export function getAllTags(): string[] {
  const bySlug = new Map<string, string>()
  for (const post of getBlogPosts()) for (const tag of post.tags) if (!bySlug.has(tagSlug(tag))) bySlug.set(tagSlug(tag), tag)
  return Array.from(bySlug.values()).sort((a, b) => a.localeCompare(b))
}

export function getTagName(slug: string): string | undefined {
  const wanted = tagSlug(decodeURIComponent(slug))
  return getAllTags().find((t) => tagSlug(t) === wanted)
}

export function getPostsByCategory(category: Category): BlogPostMeta[] {
  return getBlogPosts().filter((p) => category.types.includes(p.type))
}

export function getPostsByAuthor(authorSlug: string): BlogPostMeta[] {
  return getBlogPosts().filter((p) => p.authorSlug === authorSlug)
}

/** Related posts: same type and shared tags rank highest; ties broken by recency. */
export function getRelatedPosts(post: BlogPostMeta, all: BlogPostMeta[], limit = 3): BlogPostMeta[] {
  const tags = new Set(post.tags.map(tagSlug))
  return all
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({ p, score: (p.type === post.type ? 2 : 0) + p.tags.filter((t) => tags.has(tagSlug(t))).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.p.date).getTime() - new Date(a.p.date).getTime())
    .slice(0, limit)
    .map((x) => x.p)
}

/** Format date for display */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Blog CTA link with UTM params (see content contract). */
export function ctaHref(slug: string, position: string): string {
  const q = new URLSearchParams({ utm_source: 'blog', utm_medium: 'article', utm_campaign: slug, utm_content: position })
  return `/?${q.toString()}#studio-url`
}
