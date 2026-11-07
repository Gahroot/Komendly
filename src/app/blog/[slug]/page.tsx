import { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBlogPost, getBlogSlugs, formatDate, getBlogPosts } from '@/lib/blog'
import { renderMDX } from '@/lib/mdx'
import { BlogPostCard } from '@/components/blog-post-card'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const slugs = getBlogSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogPost(slug)

  if (!post) {
    return {}
  }

  return {
    title: `${post.title} | Komendly Blog`,
    description: post.description,
    authors: [{ name: post.author }],
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
      images: post.image ? [post.image] : [`/blog/${post.slug}/opengraph-image`],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: post.image ? [post.image] : [`/blog/${post.slug}/opengraph-image`],
    },
  }
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params
  const post = getBlogPost(slug)

  if (!post) {
    notFound()
  }

  const content = await renderMDX({ source: post.content })

  // Get related posts (same tag, excluding current)
  const allPosts = getBlogPosts()
  const relatedPosts = allPosts
    .filter((p) => p.slug !== slug)
    .filter((p) => p.tags.some((t) => post.tags.includes(t)))
    .slice(0, 2)

  return (
    <main className="relative z-10 px-4 pb-12 pt-10 sm:px-6 sm:pt-16">
      <article className="mx-auto max-w-[68ch]">
        <header className="studio-rise mb-10">
          <div className="mb-5 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <Link
                key={tag}
                href={`/blog/tag/${tag.toLowerCase()}`}
                className="spell-chip rounded-full px-2.5 py-1 text-xs font-medium"
              >
                {tag}
              </Link>
            ))}
          </div>

          <h1 className="font-display mb-5 text-4xl font-medium leading-[1.1] tracking-[-0.02em] text-foreground sm:text-5xl">
            {post.title}
          </h1>

          <p className="mb-6 text-xl leading-relaxed text-muted-foreground">{post.description}</p>

          <p className="border-b border-border pb-8 font-mono text-xs text-muted-foreground">
            {post.author}
            <span aria-hidden> · </span>
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span aria-hidden> · </span>
            {post.readingTime}
          </p>
        </header>

        {post.image && (
          <div className="studio-frame mb-10 rounded-2xl p-3 hover:transform-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.image} alt={post.title} className="aspect-video w-full rounded-md object-cover" />
          </div>
        )}

        <div className="text-[17px] leading-[1.75] text-foreground sm:text-[18px]">{content}</div>

        <aside className="relative mt-14 overflow-hidden rounded-3xl border border-border bg-[linear-gradient(160deg,#24124a,#160b2c_60%,#2a1020)] p-6 sm:p-8">
          <div aria-hidden className="pointer-events-none absolute -bottom-20 left-1/2 h-48 w-[80%] -translate-x-1/2 rounded-full bg-[oklch(0.62_0.17_45/0.35)] blur-3xl" />
          <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <Image
              src="/brand/ozzy-classic-happy.png"
              width={96}
              height={96}
              unoptimized
              alt=""
              style={{ imageRendering: 'pixelated' }}
            />
            <div className="flex-1 space-y-2">
              <h2 className="font-display text-2xl font-medium tracking-[-0.015em]">Turn your website into ads</h2>
              <p className="text-sm text-muted-foreground">Paste your URL and get ready-to-run static and animated ads in minutes. Free to try.</p>
            </div>
            <Link href="/#studio-url" className="spellbar__cta inline-flex h-12 items-center justify-center whitespace-nowrap rounded-2xl px-6 font-semibold">
              Make my free ads
            </Link>
          </div>
        </aside>
      </article>

      {relatedPosts.length > 0 && (
        <section className="mx-auto mt-16 max-w-6xl" aria-labelledby="related-title">
          <h2 id="related-title" className="font-display mb-6 text-3xl font-medium tracking-[-0.015em]">Keep reading</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {relatedPosts.map((relatedPost) => (
              <BlogPostCard key={relatedPost.slug} post={relatedPost} />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
