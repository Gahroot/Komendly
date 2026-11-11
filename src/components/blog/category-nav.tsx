import Link from 'next/link'
import { CATEGORIES } from '@/lib/blog'

/** Links to the type hubs; `counts` hides empty categories. */
export function CategoryNav({ counts, active }: { counts: Record<string, number>; active?: string }) {
  const visible = CATEGORIES.filter((c) => (counts[c.slug] ?? 0) > 0)
  if (!visible.length) return null
  return (
    <nav aria-label="Blog categories" className="mb-6 flex flex-wrap gap-3">
      {visible.map((c) => (
        <Link
          key={c.slug}
          href={`/blog/category/${c.slug}`}
          aria-current={active === c.slug ? 'page' : undefined}
          className="studio-frame rounded-2xl px-4 py-2.5 text-sm font-semibold hover:transform-none aria-[current=page]:text-[var(--studio-gold)]"
        >
          {c.name} <span className="font-mono text-xs text-muted-foreground">{counts[c.slug]}</span>
        </Link>
      ))}
    </nav>
  )
}
