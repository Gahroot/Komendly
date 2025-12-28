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
    <div className="min-h-screen bg-zinc-950">
      <div className="container mx-auto px-4 py-16 max-w-5xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-100 mb-4">
            Blog
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl">
            Insights, tutorials, and updates about AI video testimonials,
            customer reviews, and growing your business with social proof.
          </p>
        </header>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <Link
              href="/blog"
              className="text-sm font-medium text-zinc-100 bg-zinc-800 px-3 py-1.5 rounded-full hover:bg-zinc-700 transition-colors"
            >
              All Posts
            </Link>
            {tags.map((tag) => (
              <Link
                key={tag}
                href={`/blog/tag/${tag.toLowerCase()}`}
                className="text-sm font-medium text-zinc-400 bg-zinc-800/50 px-3 py-1.5 rounded-full hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
              >
                {tag}
              </Link>
            ))}
          </div>
        )}

        {posts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-zinc-400 text-lg">No blog posts yet. Check back soon!</p>
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
