import { compileMDX } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypePrettyCode from 'rehype-pretty-code'
import type { ComponentProps, ReactNode } from 'react'

// Custom MDX components for styling
const mdxComponents = {
  h1: (props: ComponentProps<'h1'>) => (
    <h1 className="font-display mt-12 mb-4 text-4xl font-medium leading-tight tracking-[-0.02em] text-foreground [&_a]:no-underline" {...props} />
  ),
  h2: (props: ComponentProps<'h2'>) => (
    <h2 className="font-display mt-12 mb-4 text-3xl font-medium leading-tight tracking-[-0.015em] text-foreground scroll-mt-24 [&_a]:no-underline" {...props} />
  ),
  h3: (props: ComponentProps<'h3'>) => (
    <h3 className="font-display mt-8 mb-3 text-2xl font-medium leading-snug text-foreground scroll-mt-24 [&_a]:no-underline" {...props} />
  ),
  h4: (props: ComponentProps<'h4'>) => (
    <h4 className="mt-6 mb-2 text-lg font-semibold text-foreground" {...props} />
  ),
  p: (props: ComponentProps<'p'>) => <p className="mb-6 text-foreground/90" {...props} />,
  a: (props: ComponentProps<'a'>) => {
    // Footnote refs from transformFootnotes: `[n](#source-n)` -> superscript citation link
    if (props.href?.startsWith('#source-')) {
      return (
        <sup className="ml-0.5 font-mono text-[0.7em]">
          <a
            href={props.href}
            aria-label={`Source ${props.href.slice('#source-'.length)}`}
            className="text-[var(--studio-gold)] no-underline hover:underline"
          >
            [{props.children}]
          </a>
        </sup>
      )
    }
    return (
    <a
      className="text-[var(--studio-gold)] underline decoration-[var(--studio-gold)]/50 underline-offset-4 transition-colors hover:decoration-[var(--studio-gold)]"
      target={props.href?.startsWith('http') ? '_blank' : undefined}
      rel={props.href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      {...props}
    />
    )
  },
  ul: (props: ComponentProps<'ul'>) => (
    <ul className="mb-6 list-disc space-y-2 pl-6 text-foreground/90 marker:text-[var(--studio-gold)]" {...props} />
  ),
  ol: (props: ComponentProps<'ol'>) => (
    <ol className="mb-6 list-decimal space-y-2 pl-6 text-foreground/90 marker:font-mono marker:text-[var(--studio-gold)]" {...props} />
  ),
  li: (props: ComponentProps<'li'>) => <li className="pl-1" {...props} />,
  blockquote: (props: ComponentProps<'blockquote'>) => (
    <blockquote
      className="font-display my-8 border-l-4 border-[var(--studio-gold)] bg-muted py-3 pl-5 pr-4 text-xl italic text-foreground [&_p]:mb-0"
      {...props}
    />
  ),
  code: (props: ComponentProps<'code'>) => {
    // Inline code (not inside pre)
    if (!props.className?.includes('language-')) {
      return (
        <code
          className="rounded border border-border bg-[var(--studio-ink)] px-1.5 py-0.5 font-mono text-[0.88em] text-foreground"
          {...props}
        />
      )
    }
    return <code {...props} />
  },
  pre: (props: ComponentProps<'pre'>) => (
    <pre
      className="my-6 overflow-x-auto rounded-xl border border-border !bg-[var(--studio-ink)] p-4 font-mono text-sm leading-relaxed"
      {...props}
    />
  ),
  hr: () => <hr className="my-10 border-border" />,
  table: (props: ComponentProps<'table'>) => (
    <div className="my-8 overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full border-collapse text-[15px]" {...props} />
    </div>
  ),
  th: (props: ComponentProps<'th'>) => (
    <th
      className="border-b border-border bg-muted px-4 py-3 text-left font-mono text-xs font-medium uppercase tracking-wide text-[var(--studio-gold)]"
      {...props}
    />
  ),
  td: (props: ComponentProps<'td'>) => (
    <td className="border-b border-border px-4 py-3 text-foreground/90" {...props} />
  ),
  img: (props: ComponentProps<'img'>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="my-8 rounded-md border border-border p-2 bg-card shadow-[0_20px_50px_-20px_#000c]"
      alt={props.alt || ''}
      {...props}
    />
  ),
  strong: (props: ComponentProps<'strong'>) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  em: (props: ComponentProps<'em'>) => <em className="italic" {...props} />,
}

interface CompileMDXOptions {
  source: string
  /** Extra components available to the body, e.g. an inline CTA inserted by the page. */
  components?: Record<string, (props: Record<string, never>) => ReactNode>
}

export async function renderMDX({ source, components }: CompileMDXOptions): Promise<ReactNode> {
  const { content } = await compileMDX({
    source,
    components: { ...mdxComponents, ...components },
    options: {
      parseFrontmatter: false,
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            {
              behavior: 'wrap',
              properties: {
                className: ['anchor'],
              },
            },
          ],
          [
            rehypePrettyCode,
            {
              theme: 'github-dark',
              keepBackground: true,
            },
          ],
        ],
      },
    },
  })

  return content
}

export { mdxComponents }
