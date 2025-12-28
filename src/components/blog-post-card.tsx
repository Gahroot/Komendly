import Link from 'next/link'
import { formatDate, type BlogPostMeta } from '@/lib/blog'
import { Calendar, Clock, ArrowRight } from 'lucide-react'

interface BlogPostCardProps {
  post: BlogPostMeta
}

export function BlogPostCard({ post }: BlogPostCardProps) {
  return (
    <article className="group relative rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 transition-all hover:border-zinc-700 hover:bg-zinc-900/80">
      <Link href={`/blog/${post.slug}`} className="absolute inset-0 z-10">
        <span className="sr-only">Read {post.title}</span>
      </Link>

      {post.image && (
        <div className="mb-4 overflow-hidden rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image}
            alt={post.title}
            className="aspect-video w-full object-cover transition-transform group-hover:scale-105"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        {post.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="text-xs font-medium text-purple-400 bg-purple-500/10 px-2 py-1 rounded-full"
          >
            {tag}
          </span>
        ))}
      </div>

      <h2 className="text-xl font-semibold text-zinc-100 mb-2 group-hover:text-purple-400 transition-colors">
        {post.title}
      </h2>

      <p className="text-zinc-400 text-sm mb-4 line-clamp-2">
        {post.description}
      </p>

      <div className="flex items-center gap-4 text-xs text-zinc-500">
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
        <ArrowRight className="h-5 w-5 text-purple-400" />
      </div>
    </article>
  )
}
