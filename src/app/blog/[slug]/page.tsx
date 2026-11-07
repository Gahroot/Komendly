import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { categoryForType, getBlogPost, getBlogPosts, getBlogSlugs, getRelatedPosts, tagSlug } from '@/lib/blog'
import { extractToc, insertAfterSecondSection, stripFootnotes, transformFootnotes } from '@/lib/blog-content'
import { getAuthorBySlug, resolveAuthor } from '@/lib/authors'
import { renderMDX } from '@/lib/mdx'
import { blogPostingJsonLd, breadcrumbJsonLd, faqJsonLd, graph } from '@/lib/seo/jsonld'
import { absoluteUrl } from '@/lib/site'
import { BlogPostCard } from '@/components/blog-post-card'
import { JsonLd } from '@/components/json-ld'
import {
  AuthorCard,
  Breadcrumbs,
  Byline,
  EndCta,
  FaqSection,
  InlineCta,
  KeyTakeaways,
  QuickAnswer,
  SourcesList,
  TableOfContents,
} from '@/components/blog/post-parts'

interface PageProps {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export async function generateStaticParams() {
  return getBlogSlugs().map((slug) => ({ slug }))
}

function ogImage(post: { slug: string; image?: string }): string {
  return post.image ?? `/blog/${post.slug}/opengraph-image`
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) return {}
  const path = `/blog/${post.slug}`
  return {
    title: post.title,
    description: post.description,
    authors: [{ name: post.author, url: absoluteUrl(`/blog/author/${post.authorSlug}`) }],
    keywords: [post.primaryKeyword, ...post.secondaryKeywords].filter((k): k is string => Boolean(k)),
    alternates: { canonical: path },
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      url: path,
      publishedTime: post.date,
      modifiedTime: post.updated,
      authors: [absoluteUrl(`/blog/author/${post.authorSlug}`)],
      tags: post.tags,
      images: [ogImage(post)],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [ogImage(post)],
    },
  }
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) notFound()

  const author = getAuthorBySlug(post.authorSlug) ?? resolveAuthor(post.author)
  const category = categoryForType(post.type)
  const body = transformFootnotes(post.content, post.sources.map((s) => s.id))
  const toc = extractToc(body)
  const showToc = toc.filter((t) => t.depth === 2).length >= 4
  const content = await renderMDX({
    source: insertAfterSecondSection(body, '<InlineCta />'),
    components: { InlineCta: () => <InlineCta slug={post.slug} cta={post.cta} /> },
  })
  const relatedPosts = getRelatedPosts(post, getBlogPosts(), 3)

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Blog', path: '/blog' },
    { name: category.name, path: `/blog/category/${category.slug}` },
    { name: post.title, path: `/blog/${post.slug}` },
  ]
  const url = absoluteUrl(`/blog/${post.slug}`)

  return (
    <main className="relative z-10 px-4 pb-12 pt-10 sm:px-6 sm:pt-16">
      <JsonLd
        data={graph(
          blogPostingJsonLd({ ...post, answer: post.answer && stripFootnotes(post.answer) }, author, ogImage(post)),
          faqJsonLd(post.faq, url),
          breadcrumbJsonLd(crumbs),
        )}
      />
      <article className="mx-auto max-w-[68ch]">
        <header className="studio-rise mb-10">
          <Breadcrumbs items={[...crumbs.slice(0, -1), { name: post.title }]} />
          <div className="mb-5 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <Link key={tag} href={`/blog/tag/${tagSlug(tag)}`} className="spell-chip rounded-full px-2.5 py-1 text-xs font-medium">
                {tag}
              </Link>
            ))}
          </div>

          <h1 className="font-display mb-5 text-4xl font-medium leading-[1.1] tracking-[-0.02em] text-foreground sm:text-5xl">
            {post.title}
          </h1>

          <p className="mb-6 text-xl leading-relaxed text-muted-foreground">{post.description}</p>

          <Byline author={author} date={post.date} updated={post.updated} readingTime={post.readingTime} />
        </header>

        {post.answer && <QuickAnswer answer={post.answer} />}
        {post.keyTakeaways.length > 0 && <KeyTakeaways items={post.keyTakeaways} />}
        {showToc && <TableOfContents items={toc} />}

        {post.image && (
          <div className="studio-frame mb-10 rounded-2xl p-3 hover:transform-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.image} alt={post.title} className="aspect-video w-full rounded-md object-cover" />
          </div>
        )}

        <div className="text-[17px] leading-[1.75] text-foreground sm:text-[18px]">{content}</div>

        {post.faq.length > 0 && <FaqSection faq={post.faq} />}

        <EndCta slug={post.slug} cta={post.cta} />

        {post.sources.length > 0 && <SourcesList sources={post.sources} />}

        <AuthorCard author={author} />
      </article>

      {relatedPosts.length > 0 && (
        <section className="mx-auto mt-16 max-w-6xl" aria-labelledby="related-title">
          <h2 id="related-title" className="font-display mb-6 text-3xl font-medium tracking-[-0.015em]">Keep reading</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {relatedPosts.map((relatedPost) => (
              <BlogPostCard key={relatedPost.slug} post={relatedPost} />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
