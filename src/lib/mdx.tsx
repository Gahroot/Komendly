import { compileMDX } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypePrettyCode from 'rehype-pretty-code'
import type { ComponentProps, ReactNode } from 'react'

// Custom MDX components for styling
const mdxComponents = {
  h1: (props: ComponentProps<'h1'>) => (
    <h1
      className="mt-8 mb-4 text-4xl font-bold tracking-tight text-zinc-100"
      {...props}
    />
  ),
  h2: (props: ComponentProps<'h2'>) => (
    <h2
      className="mt-8 mb-4 text-3xl font-bold tracking-tight text-zinc-100"
      {...props}
    />
  ),
  h3: (props: ComponentProps<'h3'>) => (
    <h3
      className="mt-6 mb-3 text-2xl font-semibold text-zinc-100"
      {...props}
    />
  ),
  h4: (props: ComponentProps<'h4'>) => (
    <h4
      className="mt-4 mb-2 text-xl font-semibold text-zinc-100"
      {...props}
    />
  ),
  p: (props: ComponentProps<'p'>) => (
    <p className="mb-4 text-zinc-400 leading-relaxed" {...props} />
  ),
  a: (props: ComponentProps<'a'>) => (
    <a
      className="text-purple-400 hover:text-purple-300 underline underline-offset-4"
      target={props.href?.startsWith('http') ? '_blank' : undefined}
      rel={props.href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      {...props}
    />
  ),
  ul: (props: ComponentProps<'ul'>) => (
    <ul className="mb-4 list-disc list-inside text-zinc-400 space-y-1" {...props} />
  ),
  ol: (props: ComponentProps<'ol'>) => (
    <ol className="mb-4 list-decimal list-inside text-zinc-400 space-y-1" {...props} />
  ),
  li: (props: ComponentProps<'li'>) => (
    <li className="text-zinc-400" {...props} />
  ),
  blockquote: (props: ComponentProps<'blockquote'>) => (
    <blockquote
      className="mb-4 border-l-4 border-purple-500 pl-4 italic text-zinc-400"
      {...props}
    />
  ),
  code: (props: ComponentProps<'code'>) => {
    // Inline code (not inside pre)
    if (!props.className?.includes('language-')) {
      return (
        <code
          className="bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded text-sm font-mono"
          {...props}
        />
      )
    }
    return <code {...props} />
  },
  pre: (props: ComponentProps<'pre'>) => (
    <pre
      className="mb-4 overflow-x-auto rounded-lg bg-zinc-900 p-4 text-sm"
      {...props}
    />
  ),
  hr: () => <hr className="my-8 border-zinc-800" />,
  table: (props: ComponentProps<'table'>) => (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full border-collapse text-zinc-400" {...props} />
    </div>
  ),
  th: (props: ComponentProps<'th'>) => (
    <th
      className="border border-zinc-800 bg-zinc-900 px-4 py-2 text-left font-semibold text-zinc-100"
      {...props}
    />
  ),
  td: (props: ComponentProps<'td'>) => (
    <td className="border border-zinc-800 px-4 py-2" {...props} />
  ),
  img: (props: ComponentProps<'img'>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="rounded-lg my-6" alt={props.alt || ''} {...props} />
  ),
  strong: (props: ComponentProps<'strong'>) => (
    <strong className="font-semibold text-zinc-200" {...props} />
  ),
  em: (props: ComponentProps<'em'>) => (
    <em className="italic" {...props} />
  ),
}

interface CompileMDXOptions {
  source: string
}

export async function renderMDX({ source }: CompileMDXOptions): Promise<ReactNode> {
  const { content } = await compileMDX({
    source,
    components: mdxComponents,
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
