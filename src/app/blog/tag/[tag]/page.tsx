import { Metadata } from 'next'
import { getBlogPostsByTag, getAllTags } from '@/lib/blog'
import { BlogPostCard } from '@/components/blog-post-card'
import { BlogTagPills } from '@/components/blog-tag-pills'

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
    <main className="relative z-10 mx-auto max-w-6xl px-4 pb-12 pt-10 sm:px-6 sm:pt-16">
      <header className="studio-rise mb-10">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-[var(--studio-gold)]">Blog · Tag</p>
        <h1 className="font-display mb-4 text-4xl font-medium tracking-[-0.02em] text-foreground sm:text-6xl">
          {formattedTag}
        </h1>
        <p className="font-mono text-sm text-muted-foreground">
          {posts.length} {posts.length === 1 ? 'post' : 'posts'}
        </p>
      </header>

      <BlogTagPills tags={allTags} active={tag} />

      {posts.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg text-muted-foreground">No posts found with this tag.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <BlogPostCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </main>
  )
}
