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
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to blog
        </Link>

        <header className="mb-12">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl mb-4">
            Posts tagged &quot;{formattedTag}&quot;
          </h1>
          <p className="text-lg text-muted-foreground">
            {posts.length} {posts.length === 1 ? 'post' : 'posts'} found
          </p>
        </header>

        <div className="flex flex-wrap gap-2 mb-8">
          <Link
            href="/blog"
            className="text-sm font-medium text-muted-foreground bg-muted px-3 py-1.5 rounded-full hover:bg-secondary hover:text-foreground transition-colors"
          >
            All Posts
          </Link>
          {allTags.map((t) => (
            <Link
              key={t}
              href={`/blog/tag/${t.toLowerCase()}`}
              className={`text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${
                t.toLowerCase() === tag
                  ? 'text-foreground bg-secondary'
                  : 'text-muted-foreground bg-muted hover:bg-secondary hover:text-foreground'
              }`}
            >
              {t}
            </Link>
          ))}
        </div>

        {posts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-lg">
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
