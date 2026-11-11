import { Metadata } from 'next'
import Image from 'next/image'
import { CATEGORIES, getAllTags, getBlogPosts } from '@/lib/blog'
import { blogJsonLd, breadcrumbJsonLd, graph } from '@/lib/seo/jsonld'
import { BlogPostCard } from '@/components/blog-post-card'
import { BlogTagPills } from '@/components/blog-tag-pills'
import { CategoryNav } from '@/components/blog/category-nav'
import { JsonLd } from '@/components/json-ld'

const TITLE = 'Blog: ad creative, Meta ads and small business marketing'
const DESCRIPTION =
  'Guides, comparisons and straight answers on ad creative, Facebook and Instagram (Meta) ads, AI ad generators, video testimonials and marketing for small businesses.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/blog' },
  openGraph: { title: `${TITLE} | Komendly`, description: DESCRIPTION, type: 'website', url: '/blog' },
}

export default function BlogPage() {
  const posts = getBlogPosts()
  const tags = getAllTags()
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.slug, posts.filter((p) => c.types.includes(p.type)).length]))
  const [featured, ...rest] = posts

  return (
    <main className="relative z-10 mx-auto max-w-6xl px-4 pb-12 pt-10 sm:px-6 sm:pt-16">
      <JsonLd data={graph(blogJsonLd(DESCRIPTION, posts), breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Blog', path: '/blog' }]))} />
      <header className="studio-rise mb-10 flex items-end justify-between gap-6">
        <div>
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-[var(--studio-gold)]">Blog</p>
          <h1 className="font-display mb-4 text-4xl font-medium tracking-[-0.02em] text-foreground sm:text-6xl">
            The Komendly <em className="italic text-[var(--studio-gold)]">Journal</em>
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Notes on ad creative, Meta ads, social proof and marketing that actually sells, for small businesses.
          </p>
        </div>
        <Image
          src="/brand/ozzy-creator-focused.png"
          width={112}
          height={112}
          unoptimized
          alt=""
          className="hidden shrink-0 sm:block"
          style={{ imageRendering: 'pixelated' }}
        />
      </header>

      <CategoryNav counts={counts} />
      {tags.length > 0 && <BlogTagPills tags={tags} active={null} />}

      {!featured ? (
        <div className="py-16 text-center">
          <p className="text-lg text-muted-foreground">No blog posts yet. Check back soon!</p>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <BlogPostCard post={featured} featured />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((post) => (
              <BlogPostCard key={post.slug} post={post} />
            ))}
          </div>
        </>
      )}
    </main>
  )
}
