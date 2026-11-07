import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AUTHORS, authorPath, getAuthorBySlug } from '@/lib/authors'
import { getPostsByAuthor } from '@/lib/blog'
import { breadcrumbJsonLd, graph, profilePageJsonLd } from '@/lib/seo/jsonld'
import { BlogPostCard } from '@/components/blog-post-card'
import { JsonLd } from '@/components/json-ld'

interface PageProps {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export async function generateStaticParams() {
  return AUTHORS.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const author = getAuthorBySlug(slug)
  if (!author) return {}
  return {
    title: `${author.name}, ${author.jobTitle}`,
    description: author.bio,
    alternates: { canonical: authorPath(author) },
    openGraph: { type: 'profile', title: author.name, description: author.bio, url: authorPath(author) },
  }
}

export default async function AuthorPage({ params }: PageProps) {
  const { slug } = await params
  const author = getAuthorBySlug(slug)
  if (!author) notFound()
  const posts = getPostsByAuthor(author.slug)

  return (
    <main className="relative z-10 mx-auto max-w-6xl px-4 pb-12 pt-10 sm:px-6 sm:pt-16">
      <JsonLd
        data={graph(
          profilePageJsonLd(author, posts),
          breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Blog', path: '/blog' }, { name: author.name, path: authorPath(author) }]),
        )}
      />
      <header className="studio-rise mb-10 max-w-3xl">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-[var(--studio-gold)]">Author</p>
        <h1 className="font-display mb-2 text-4xl font-medium tracking-[-0.02em] text-foreground sm:text-6xl">{author.name}</h1>
        <p className="mb-4 font-mono text-sm text-muted-foreground">{author.jobTitle}</p>
        <p className="text-lg text-foreground/90">{author.bio}</p>
        {author.sameAs.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-3 text-sm">
            {author.sameAs.map((u) => (
              <li key={u}>
                <a href={u} rel="me noopener noreferrer" target="_blank" className="text-[var(--studio-gold)] underline underline-offset-4">
                  {new URL(u).hostname.replace(/^www\./, '')}
                </a>
              </li>
            ))}
          </ul>
        )}
      </header>

      <h2 className="font-display mb-6 text-3xl font-medium tracking-[-0.015em]">Articles by {author.name}</h2>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <BlogPostCard key={post.slug} post={post} />
        ))}
      </div>
    </main>
  )
}
