import GithubSlugger from 'github-slugger'

/** Markdown transforms for blog bodies. Pure: string in, string out. */

const FENCE = /^\s*(```|~~~)/

/** Apply `fn` to every line outside fenced code blocks; inline code spans inside a line are left untouched. */
function mapProse(md: string, fn: (text: string) => string): string {
  let inFence = false
  return md
    .split('\n')
    .map((line) => {
      if (FENCE.test(line)) {
        inFence = !inFence
        return line
      }
      if (inFence) return line
      return line
        .split(/(`+[^`]*`+)/)
        .map((part, i) => (i % 2 === 1 ? part : fn(part)))
        .join('')
    })
    .join('\n')
}

/**
 * `[^n]` -> `[n](#source-n)` (rendered as a superscript link by the MDX `a` component).
 * Refs to unknown source ids are dropped; body footnote definitions (`[^n]: ...`) are removed.
 */
export function transformFootnotes(md: string, sourceIds: readonly number[]): string {
  const known = new Set(sourceIds)
  const noDefs = mapProse(md, (t) => (/^\s*\[\^\w+\]:/.test(t) ? '' : t))
  return mapProse(noDefs, (t) =>
    t.replace(/\[\^(\w+)\](?!:)/g, (_m, id: string) => {
      const n = Number(id)
      return Number.isInteger(n) && known.has(n) ? `[${n}](#source-${n})` : ''
    }),
  )
}

/** Remove `[^n]` refs from plain text (meta, JSON-LD, feeds). */
export function stripFootnotes(text: string): string {
  return text.replace(/\s?\[\^\w+\]/g, '').trim()
}

/** Split text into plain segments and footnote ids, for rendering FAQ answers with superscripts. */
export function splitFootnotes(text: string): Array<{ text: string } | { ref: number }> {
  const out: Array<{ text: string } | { ref: number }> = []
  let last = 0
  for (const m of text.matchAll(/\[\^(\d+)\]/g)) {
    const idx = m.index ?? 0
    if (idx > last) out.push({ text: text.slice(last, idx) })
    out.push({ ref: Number(m[1]) })
    last = idx + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

function h2LineIndexes(lines: string[]): number[] {
  let inFence = false
  const out: number[] = []
  lines.forEach((line, i) => {
    if (FENCE.test(line)) inFence = !inFence
    else if (!inFence && /^##\s+\S/.test(line)) out.push(i)
  })
  return out
}

/** Insert `marker` (a JSX element line) just before the 3rd H2, i.e. after the 2nd section. No-op with fewer than 3 H2s. */
export function insertAfterSecondSection(md: string, marker: string): string {
  const lines = md.split('\n')
  const third = h2LineIndexes(lines)[2]
  if (third === undefined) return md
  return [...lines.slice(0, third), '', marker, '', ...lines.slice(third)].join('\n')
}

export interface TocItem {
  id: string
  text: string
  depth: 2 | 3
}

/** Heading text as rendered (markdown syntax stripped), matching what rehype-slug sees. */
export function headingText(raw: string): string {
  return raw
    .replace(/\s+#+\s*$/, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .trim()
}

/** H2/H3 table of contents with ids identical to rehype-slug (github-slugger, same order). */
export function extractToc(md: string): TocItem[] {
  const slugger = new GithubSlugger()
  const out: TocItem[] = []
  let inFence = false
  for (const line of md.split('\n')) {
    if (FENCE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^(#{1,6})\s+(.+)$/.exec(line)
    if (!m?.[1] || !m[2]) continue
    const text = headingText(m[2])
    const id = slugger.slug(text)
    const depth = m[1].length
    if (depth === 2 || depth === 3) out.push({ id, text, depth })
  }
  return out
}
