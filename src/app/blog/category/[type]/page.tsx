import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CATEGORIES, getBlogPosts, getCategory, getPostsByCategory } from '@/lib/blog'
import { breadcrumbJsonLd, collectionPageJsonLd, graph } from '@/lib/seo/jsonld'
import { BlogPostCard } from '@/components/blog-post-card'
import { CategoryNav } from '@/components/blog/category-nav'
import { JsonLd } from '@/components/json-ld'

interface PageProps {
  params: Promise<{ type: string }>
}

export const dynamicParams = false

export async function generateStaticParams() {
  return CATEGORIES.map((c) => ({ type: c.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type } = await params
  const category = getCategory(type)
  if (!category) return {}
  const empty = getPostsByCategory(category).length === 0
  return {
    title: `${category.name}: Komendly blog`,
    description: category.intro,
    alternates: { canonical: `/blog/category/${category.slug}` },
    ...(empty ? { robots: { index: false, follow: true } } : {}),
  }
}

export default async function CategoryPage({ params }: PageProps) {
  const { type } = await params
  const category = getCategory(type)
  if (!category) notFound()
  const posts = getPostsByCategory(category)
  const all = getBlogPosts()
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.slug, all.filter((p) => c.types.includes(p.type)).length]))
  const path = `/blog/category/${category.slug}`

  return (
    <main className="relative z-10 mx-auto max-w-6xl px-4 pb-12 pt-10 sm:px-6 sm:pt-16">
      <JsonLd
        data={graph(
          collectionPageJsonLd({ name: category.name, description: category.intro, path, posts }),
          breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Blog', path: '/blog' }, { name: category.name, path }]),
        )}
      />
      <header className="studio-rise mb-10">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-[var(--studio-gold)]">Blog · Category</p>
        <h1 className="font-display mb-4 text-4xl font-medium tracking-[-0.02em] text-foreground sm:text-6xl">{category.name}</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">{category.intro}</p>
      </header>

      <CategoryNav counts={counts} active={category.slug} />

      {posts.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg text-muted-foreground">New {category.name.toLowerCase()} are on the way. Check back soon.</p>
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
