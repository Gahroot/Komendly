import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBlogPost, getBlogSlugs, formatDate, getBlogPosts } from '@/lib/blog'
import { renderMDX } from '@/lib/mdx'
import { ArrowLeft, Calendar, Clock, User } from 'lucide-react'
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
      images: post.image ? [post.image] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: post.image ? [post.image] : undefined,
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
    <div className="min-h-screen bg-zinc-950">
      <article className="container mx-auto px-4 py-16 max-w-3xl">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to blog
        </Link>

        <header className="mb-8">
          <div className="flex flex-wrap gap-2 mb-4">
            {post.tags.map((tag) => (
              <Link
                key={tag}
                href={`/blog/tag/${tag.toLowerCase()}`}
                className="text-xs font-medium text-purple-400 bg-purple-500/10 px-2 py-1 rounded-full hover:bg-purple-500/20 transition-colors"
              >
                {tag}
              </Link>
            ))}
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-zinc-100 mb-4">
            {post.title}
          </h1>

          <p className="text-xl text-zinc-400 mb-6">
            {post.description}
          </p>

          <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-500 pb-8 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>{post.author}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <time dateTime={post.date}>{formatDate(post.date)}</time>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>{post.readingTime}</span>
            </div>
          </div>
        </header>

        {post.image && (
          <div className="mb-8 overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.image}
              alt={post.title}
              className="w-full aspect-video object-cover"
            />
          </div>
        )}

        <div className="prose prose-invert max-w-none">
          {content}
        </div>

        <footer className="mt-12 pt-8 border-t border-zinc-800">
          <div className="flex items-center justify-between mb-8">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to all posts
            </Link>
          </div>

          {relatedPosts.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold text-zinc-100 mb-6">Related Posts</h2>
              <div className="grid gap-6 md:grid-cols-2">
                {relatedPosts.map((relatedPost) => (
                  <BlogPostCard key={relatedPost.slug} post={relatedPost} />
                ))}
              </div>
            </div>
          )}
        </footer>
      </article>
    </div>
  )
}
