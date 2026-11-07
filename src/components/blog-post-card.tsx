import Link from 'next/link'
import { formatDate, type BlogPostMeta } from '@/lib/blog'

interface BlogPostCardProps {
  post: BlogPostMeta
  featured?: boolean
}

export function BlogPostCard({ post, featured = false }: BlogPostCardProps) {
  return (
    <article
      className={`studio-frame group relative rounded-2xl p-4 sm:p-5 ${
        featured ? 'grid gap-6 md:grid-cols-[1.3fr_1fr] md:items-center' : 'flex flex-col'
      }`}
    >
      <Link
        href={`/blog/${post.slug}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--studio-gold)]"
      >
        <span className="sr-only">Read {post.title}</span>
      </Link>

      {post.image && (
        <div className={`overflow-hidden rounded-md border border-border bg-[var(--studio-ink)] ${featured ? '' : 'mb-5'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.image} alt="" className="aspect-video w-full object-cover" />
        </div>
      )}

      <div className="flex flex-col">
        {featured && (
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-[var(--studio-gold)]">Latest</p>
        )}
        <h2
          className={`font-display mb-2 font-medium tracking-[-0.015em] text-foreground transition-colors group-hover:text-primary ${
            featured ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl'
          }`}
        >
          {post.title}
        </h2>
        <p className={`mb-4 text-muted-foreground ${featured ? 'text-base line-clamp-3' : 'text-sm line-clamp-2'}`}>
          {post.description}
        </p>
        <p className="mt-auto font-mono text-xs text-muted-foreground">
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          <span aria-hidden> · </span>
          {post.readingTime}
        </p>
      </div>
    </article>
  )
}
