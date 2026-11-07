import { Metadata } from 'next'
import Image from 'next/image'
import { getBlogPosts, getAllTags } from '@/lib/blog'
import { BlogPostCard } from '@/components/blog-post-card'
import { BlogTagPills } from '@/components/blog-tag-pills'

export const metadata: Metadata = {
  title: 'Blog | Komendly',
  description: 'Insights, tutorials, and updates about AI video testimonials and customer reviews.',
  openGraph: {
    title: 'Blog | Komendly',
    description: 'Insights, tutorials, and updates about AI video testimonials and customer reviews.',
    type: 'website',
  },
}

export default function BlogPage() {
  const posts = getBlogPosts()
  const tags = getAllTags()
  const [featured, ...rest] = posts

  return (
    <main className="relative z-10 mx-auto max-w-6xl px-4 pb-12 pt-10 sm:px-6 sm:pt-16">
      <header className="studio-rise mb-10 flex items-end justify-between gap-6">
        <div>
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-[var(--studio-gold)]">Blog</p>
          <h1 className="font-display mb-4 text-4xl font-medium tracking-[-0.02em] text-foreground sm:text-6xl">
            The Komendly <em className="italic text-[var(--studio-gold)]">Journal</em>
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Notes on ads, social proof and marketing that actually sells.
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
