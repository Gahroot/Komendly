import Image from 'next/image'
import Link from 'next/link'
import type { Author } from '@/lib/authors'
import { authorPath } from '@/lib/authors'
import { ctaHref, formatDate, type FaqItem, type PostCta, type PostSource } from '@/lib/blog'
import { splitFootnotes, type TocItem } from '@/lib/blog-content'

export function Breadcrumbs({ items }: { items: Array<{ name: string; path?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 font-mono text-xs text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={`${it.name}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {it.path ? (
              <Link href={it.path} className="hover:text-foreground">
                {it.name}
              </Link>
            ) : (
              <span aria-current="page" className="line-clamp-1 text-foreground/80">
                {it.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function Byline({ author, date, updated, readingTime }: { author: Author; date: string; updated: string; readingTime: string }) {
  const showUpdated = updated.slice(0, 10) !== date.slice(0, 10)
  return (
    <p className="border-b border-border pb-8 font-mono text-xs text-muted-foreground">
      By{' '}
      <Link href={authorPath(author)} rel="author" className="text-foreground underline decoration-[var(--studio-gold)]/50 underline-offset-4 hover:decoration-[var(--studio-gold)]">
        {author.name}
      </Link>
      <span aria-hidden> · </span>
      Published <time dateTime={date}>{formatDate(date)}</time>
      {showUpdated && (
        <>
          <span aria-hidden> · </span>
          Updated <time dateTime={updated}>{formatDate(updated)}</time>
        </>
      )}
      <span aria-hidden> · </span>
      {readingTime}
    </p>
  )
}

function WithRefs({ text }: { text: string }) {
  return (
    <>
      {splitFootnotes(text).map((part, i) =>
        'ref' in part ? (
          <sup key={i} className="ml-0.5 font-mono text-[0.7em]">
            <a href={`#source-${part.ref}`} aria-label={`Source ${part.ref}`} className="text-[var(--studio-gold)] hover:underline">
              [{part.ref}]
            </a>
          </sup>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  )
}

export function QuickAnswer({ answer }: { answer: string }) {
  return (
    <section aria-labelledby="quick-answer" className="mb-8 rounded-2xl border border-[var(--studio-gold)]/40 bg-card p-5 sm:p-6">
      <h2 id="quick-answer" className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-[var(--studio-gold)]">
        Quick answer
      </h2>
      <p className="text-[17px] leading-relaxed text-foreground">
        <WithRefs text={answer} />
      </p>
    </section>
  )
}

export function KeyTakeaways({ items }: { items: string[] }) {
  return (
    <section aria-labelledby="key-takeaways" className="mb-8 rounded-2xl border border-border bg-muted/40 p-5 sm:p-6">
      <h2 id="key-takeaways" className="font-display mb-3 text-xl font-medium">Key takeaways</h2>
      <ul className="list-disc space-y-2 pl-5 text-foreground/90 marker:text-[var(--studio-gold)]">
        {items.map((t) => (
          <li key={t}>
            <WithRefs text={t} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function TableOfContents({ items }: { items: TocItem[] }) {
  return (
    <nav aria-labelledby="toc-title" className="mb-10 rounded-2xl border border-border p-5 sm:p-6">
      <h2 id="toc-title" className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        In this article
      </h2>
      <ol className="space-y-1.5 text-[15px]">
        {items.map((it) => (
          <li key={it.id} className={it.depth === 3 ? 'pl-4 text-muted-foreground' : ''}>
            <a href={`#${it.id}`} className="hover:text-[var(--studio-gold)]">
              {it.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function FaqSection({ faq }: { faq: FaqItem[] }) {
  return (
    <section aria-labelledby="faq-title" className="mt-14">
      <h2 id="faq-title" className="font-display mb-6 text-3xl font-medium tracking-[-0.015em]">
        Frequently asked questions
      </h2>
      <div className="space-y-6">
        {faq.map((f) => (
          <div key={f.q}>
            <h3 className="mb-2 text-lg font-semibold text-foreground">{f.q}</h3>
            <p className="text-foreground/90">
              <WithRefs text={f.a} />
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

export function SourcesList({ sources }: { sources: PostSource[] }) {
  return (
    <section aria-labelledby="sources-title" className="mt-14 border-t border-border pt-8">
      <h2 id="sources-title" className="font-display mb-4 text-2xl font-medium">Sources</h2>
      <ol className="space-y-2 text-sm text-muted-foreground">
        {sources.map((s) => (
          <li key={s.id} id={`source-${s.id}`} className="scroll-mt-24">
            <span className="font-mono text-[var(--studio-gold)]">[{s.id}]</span>{' '}
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-foreground underline decoration-border underline-offset-4 hover:decoration-[var(--studio-gold)]">
              {s.title}
            </a>
            {s.publisher && <>, {s.publisher}</>}
            {s.accessed && <>. Accessed {formatDate(s.accessed)}</>}.
          </li>
        ))}
      </ol>
    </section>
  )
}

const CTA_COPY: Record<PostCta, { title: string; body: string; button: string }> = {
  ads: {
    title: 'Get 10 free ads from your website',
    body: 'Paste your URL and Ozzy builds 10 on-brand static ads plus 1 animated ad, ready to run. No card required.',
    button: 'Make my free ads',
  },
  motion: {
    title: 'Make a free animated video ad',
    body: 'Paste your URL and Ozzy turns your website into an animated video ad, plus 10 static ads. Free, no card required.',
    button: 'Make my free video ad',
  },
}

export function InlineCta({ slug, cta }: { slug: string; cta: PostCta }) {
  const copy = CTA_COPY[cta]
  return (
    <aside className="my-10 flex flex-col items-start gap-4 rounded-2xl border border-[var(--studio-gold)]/30 bg-card p-5 sm:flex-row sm:items-center">
      <div className="flex-1">
        <p className="mb-1 font-semibold text-foreground">{copy.title}</p>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
      </div>
      <Link href={ctaHref(slug, 'inline')} className="spellbar__cta inline-flex h-11 items-center justify-center whitespace-nowrap rounded-2xl px-5 text-sm font-semibold">
        {copy.button}
      </Link>
    </aside>
  )
}

export function EndCta({ slug, cta }: { slug: string; cta: PostCta }) {
  const copy = CTA_COPY[cta]
  return (
    <aside className="relative mt-14 overflow-hidden rounded-3xl border border-border bg-[linear-gradient(160deg,#24124a,#160b2c_60%,#2a1020)] p-6 sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -bottom-20 left-1/2 h-48 w-[80%] -translate-x-1/2 rounded-full bg-[oklch(0.62_0.17_45/0.35)] blur-3xl" />
      <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <Image src="/brand/ozzy-classic-happy.png" width={96} height={96} unoptimized alt="" style={{ imageRendering: 'pixelated' }} />
        <div className="flex-1 space-y-2">
          <h2 className="font-display text-2xl font-medium tracking-[-0.015em]">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        <Link href={ctaHref(slug, 'end')} className="spellbar__cta inline-flex h-12 items-center justify-center whitespace-nowrap rounded-2xl px-6 font-semibold">
          {copy.button}
        </Link>
      </div>
    </aside>
  )
}

export function AuthorCard({ author }: { author: Author }) {
  return (
    <section aria-label="About the author" className="mt-14 rounded-2xl border border-border p-5 sm:p-6">
      <p className="mb-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">About the author</p>
      <Link href={authorPath(author)} rel="author" className="font-display text-xl font-medium hover:text-[var(--studio-gold)]">
        {author.name}
      </Link>
      <p className="mb-2 text-sm text-muted-foreground">{author.jobTitle}</p>
      <p className="text-[15px] text-foreground/90">{author.bio}</p>
    </section>
  )
}
