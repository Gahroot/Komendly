import Link from 'next/link'
import { tagSlug } from '@/lib/blog'

/** Tag filter pills for the blog (studio .spell-chip look). `active` is the tag slug, or null for all posts. */
export function BlogTagPills({ tags, active }: { tags: string[]; active: string | null }) {
  const cls = 'spell-chip rounded-full px-3 py-1.5 text-sm font-medium'
  return (
    <nav aria-label="Blog tags" className="mb-10 flex flex-wrap gap-2">
      <Link href="/blog" className={cls} aria-checked={active === null} role="radio">
        All posts
      </Link>
      {tags.map((tag) => (
        <Link
          key={tag}
          href={`/blog/tag/${tagSlug(tag)}`}
          className={cls}
          role="radio"
          aria-checked={active === tagSlug(tag)}
        >
          {tag}
        </Link>
      ))}
    </nav>
  )
}
