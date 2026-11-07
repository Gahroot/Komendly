import { Metadata } from 'next'
import Link from 'next/link'
import { getBlogPosts, getAllTags } from '@/lib/blog'
import { BlogPostCard } from '@/components/blog-post-card'
import { ArrowLeft } from 'lucide-react'

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

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <header className="mb-12">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-primary">Blog</p>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl mb-4">
            Blog
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Insights, tutorials, and updates about AI video testimonials,
            customer reviews, and growing your business with social proof.
          </p>
        </header>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <Link
              href="/blog"
              className="text-sm font-medium text-primary-foreground bg-primary px-3 py-1.5 rounded-full hover:bg-primary/90 transition-colors"
            >
              All Posts
            </Link>
            {tags.map((tag) => (
              <Link
                key={tag}
                href={`/blog/tag/${tag.toLowerCase()}`}
                className="text-sm font-medium text-muted-foreground border border-border bg-muted px-3 py-1.5 rounded-full hover:bg-secondary hover:text-foreground transition-colors"
              >
                {tag}
              </Link>
            ))}
          </div>
        )}

        {posts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-lg">No blog posts yet. Check back soon!</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {posts.map((post) => (
              <BlogPostCard key={post.slug} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
