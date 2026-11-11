import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MIN_INDEXABLE_TAG_POSTS, getAllTags, getBlogPostsByTag, getTagName, tagSlug } from '@/lib/blog'
import { breadcrumbJsonLd, collectionPageJsonLd, graph } from '@/lib/seo/jsonld'
import { BlogPostCard } from '@/components/blog-post-card'
import { BlogTagPills } from '@/components/blog-tag-pills'
import { JsonLd } from '@/components/json-ld'

interface PageProps {
  params: Promise<{ tag: string }>
}

export const dynamicParams = false

export async function generateStaticParams() {
  return getAllTags().map((tag) => ({ tag: tagSlug(tag) }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tag } = await params
  const name = getTagName(tag)
  if (!name) return {}
  const count = getBlogPostsByTag(tag).length
  return {
    title: `${name}: articles`,
    description: `Komendly articles about ${name.toLowerCase()}: guides, comparisons and answers for small businesses.`,
    alternates: { canonical: `/blog/tag/${tagSlug(name)}` },
    ...(count < MIN_INDEXABLE_TAG_POSTS ? { robots: { index: false, follow: true } } : {}),
  }
}

export default async function TagPage({ params }: PageProps) {
  const { tag } = await params
  const name = getTagName(tag)
  if (!name) notFound()
  const posts = getBlogPostsByTag(tag)
  const allTags = getAllTags()
  const path = `/blog/tag/${tagSlug(name)}`

  return (
    <main className="relative z-10 mx-auto max-w-6xl px-4 pb-12 pt-10 sm:px-6 sm:pt-16">
      <JsonLd
        data={graph(
          collectionPageJsonLd({ name, description: `Articles tagged ${name}`, path, posts }),
          breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Blog', path: '/blog' }, { name, path }]),
        )}
      />
      <header className="studio-rise mb-10">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-[var(--studio-gold)]">Blog · Tag</p>
        <h1 className="font-display mb-4 text-4xl font-medium tracking-[-0.02em] text-foreground sm:text-6xl">{name}</h1>
        <p className="font-mono text-sm text-muted-foreground">
          {posts.length} {posts.length === 1 ? 'post' : 'posts'}
        </p>
      </header>

      <BlogTagPills tags={allTags} active={tagSlug(name)} />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <BlogPostCard key={post.slug} post={post} />
        ))}
      </div>
    </main>
  )
}
