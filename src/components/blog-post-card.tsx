import Link from 'next/link'
import { formatDate, type BlogPostMeta } from '@/lib/blog'
import { Calendar, Clock, ArrowRight } from 'lucide-react'

interface BlogPostCardProps {
  post: BlogPostMeta
}

export function BlogPostCard({ post }: BlogPostCardProps) {
  return (
    <article className="group relative glass rounded-3xl border border-border p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40">
      <Link href={`/blog/${post.slug}`} className="absolute inset-0 z-10">
        <span className="sr-only">Read {post.title}</span>
      </Link>

      {post.image && (
        <div className="mb-5 overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image}
            alt={post.title}
            className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        {post.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full"
          >
            {tag}
          </span>
        ))}
      </div>

      <h2 className="text-xl font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
        {post.title}
      </h2>

      <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
        {post.description}
      </p>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          <time dateTime={post.date}>{formatDate(post.date)}</time>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{post.readingTime}</span>
        </div>
      </div>

      <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
        <ArrowRight className="h-5 w-5 text-primary" />
      </div>
    </article>
  )
}
