import { describe, expect, it } from 'vitest'
import { extractToc, insertAfterSecondSection, splitFootnotes, stripFootnotes, transformFootnotes } from '@/lib/blog-content'

describe('transformFootnotes', () => {
  it('turns known refs into source links and drops unknown ones', () => {
    expect(transformFootnotes('Price is $49.[^1] Other[^9].', [1])).toBe('Price is $49.[1](#source-1) Other.')
  })
  it('leaves code spans and fences alone', () => {
    const md = 'Use `[^1]` here[^1]\n```\n[^1]\n```'
    expect(transformFootnotes(md, [1])).toBe('Use `[^1]` here[1](#source-1)\n```\n[^1]\n```')
  })
  it('removes body footnote definitions', () => {
    expect(transformFootnotes('A[^1]\n\n[^1]: def', [1])).toBe('A[1](#source-1)\n\n')
  })
  it('strip and split', () => {
    expect(stripFootnotes('Yes.[^1] [^2]')).toBe('Yes.')
    expect(splitFootnotes('a[^1]b')).toEqual([{ text: 'a' }, { ref: 1 }, { text: 'b' }])
  })
})

describe('insertAfterSecondSection', () => {
  it('inserts before the third H2', () => {
    const md = '## A\nx\n## B\ny\n## C\nz'
    expect(insertAfterSecondSection(md, '<X />')).toBe('## A\nx\n## B\ny\n\n<X />\n\n## C\nz')
  })
  it('ignores headings inside code and no-ops for short posts', () => {
    const md = '## A\n```\n## not\n```\n## B'
    expect(insertAfterSecondSection(md, '<X />')).toBe(md)
  })
})

describe('extractToc', () => {
  it('matches rehype-slug ids, dedupes and strips markdown', () => {
    expect(extractToc('# T\n## **Why** it [works](/x)\n### Pricing `2026`\n## Pricing 2026\n```\n## code\n```')).toEqual([
      { id: 'why-it-works', text: 'Why it works', depth: 2 },
      { id: 'pricing-2026', text: 'Pricing 2026', depth: 3 },
      { id: 'pricing-2026-1', text: 'Pricing 2026', depth: 2 },
    ])
  })
})
