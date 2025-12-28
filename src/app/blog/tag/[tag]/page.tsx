import { Metadata } from 'next'
import Link from 'next/link'
import { getBlogPostsByTag, getAllTags } from '@/lib/blog'
import { BlogPostCard } from '@/components/blog-post-card'
import { ArrowLeft } from 'lucide-react'

interface PageProps {
  params: Promise<{ tag: string }>
}

export async function generateStaticParams() {
  const tags = getAllTags()
  return tags.map((tag) => ({ tag: tag.toLowerCase() }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tag } = await params
  const formattedTag = tag.charAt(0).toUpperCase() + tag.slice(1)

  return {
    title: `${formattedTag} Posts | Komendly Blog`,
    description: `Browse all blog posts tagged with ${formattedTag}`,
  }
}

export default async function TagPage({ params }: PageProps) {
  const { tag } = await params
  const posts = getBlogPostsByTag(tag)
  const allTags = getAllTags()
  const formattedTag = tag.charAt(0).toUpperCase() + tag.slice(1)

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="container mx-auto px-4 py-16 max-w-5xl">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to blog
        </Link>

        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-100 mb-4">
            Posts tagged &quot;{formattedTag}&quot;
          </h1>
          <p className="text-lg text-zinc-400">
            {posts.length} {posts.length === 1 ? 'post' : 'posts'} found
          </p>
        </header>

        <div className="flex flex-wrap gap-2 mb-8">
          <Link
            href="/blog"
            className="text-sm font-medium text-zinc-400 bg-zinc-800/50 px-3 py-1.5 rounded-full hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            All Posts
          </Link>
          {allTags.map((t) => (
            <Link
              key={t}
              href={`/blog/tag/${t.toLowerCase()}`}
              className={`text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${
                t.toLowerCase() === tag
                  ? 'text-zinc-100 bg-zinc-800'
                  : 'text-zinc-400 bg-zinc-800/50 hover:bg-zinc-800 hover:text-zinc-100'
              }`}
            >
              {t}
            </Link>
          ))}
        </div>

        {posts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-zinc-400 text-lg">
              No posts found with this tag.
            </p>
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
