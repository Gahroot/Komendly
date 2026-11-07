import { describe, expect, it } from 'vitest'
import { parsePostFile, getRelatedPosts, tagSlug, ctaHref, getBlogPosts } from '@/lib/blog'
import { resolveAuthor } from '@/lib/authors'

const NOW = new Date('2026-01-01T00:00:00Z')

const CONTRACT_POST = `---
title: "Komendly vs AdCreative.ai"
slug: komendly-vs-adcreative-ai
description: "Desc"
date: 2026-11-07
updated: 2026-11-09
author: Nolan Grout
type: comparison
tags: ["AI ad generator", "comparison"]
published: true
answer: "Short answer.[^1]"
key_takeaways: ["one", "two"]
competitors: ["AdCreative.ai"]
cta: motion
primary_keyword: "komendly vs adcreative.ai"
secondary_keywords: ["adcreative.ai review"]
faq:
  - q: "Is it free?"
    a: "Yes.[^1]"
sources:
  - id: 2
    title: "Second"
    url: "https://example.com/2"
  - id: 1
    title: "AdCreative.ai pricing"
    publisher: "AdCreative.ai"
    url: "https://www.adcreative.ai/pricing"
    accessed: 2026-11-07
---
Body [^1]
`

describe('parsePostFile', () => {
  it('parses every contract field', () => {
    const p = parsePostFile('komendly-vs-adcreative-ai', CONTRACT_POST, NOW)
    expect(p.date).toBe('2026-11-07T00:00:00.000Z')
    expect(p.updated).toBe('2026-11-09T00:00:00.000Z')
    expect(p.author).toBe('Nolan Grout')
    expect(p.authorSlug).toBe('nolan-grout')
    expect(p.type).toBe('comparison')
    expect(p.cta).toBe('motion')
    expect(p.answer).toBe('Short answer.[^1]')
    expect(p.keyTakeaways).toEqual(['one', 'two'])
    expect(p.competitors).toEqual(['AdCreative.ai'])
    expect(p.faq).toEqual([{ q: 'Is it free?', a: 'Yes.[^1]' }])
    expect(p.sources.map((s) => s.id)).toEqual([1, 2])
    expect(p.sources[0]).toMatchObject({ publisher: 'AdCreative.ai', accessed: '2026-11-07' })
    expect(p.primaryKeyword).toBe('komendly vs adcreative.ai')
    expect(p.secondaryKeywords).toEqual(['adcreative.ai review'])
    expect(p.published).toBe(true)
  })

  it('keeps legacy posts working with defaults', () => {
    const p = parsePostFile('old', '---\ntitle: "Old"\ndate: "2025-12-24"\nauthor: "Komendly Team"\n---\nHi', NOW)
    expect(p.updated).toBe(p.date)
    expect(p.author).toBe('Nolan Grout')
    expect(p.type).toBe('guide')
    expect(p.cta).toBe('ads')
    expect(p.faq).toEqual([])
    expect(p.sources).toEqual([])
  })

  it('missing author, bad type and drafts', () => {
    const p = parsePostFile('d', '---\ntitle: D\ntype: nonsense\npublished: false\n---\n', NOW)
    expect(p.author).toBe('Nolan Grout')
    expect(p.type).toBe('guide')
    expect(p.published).toBe(false)
    expect(p.date).toBe(NOW.toISOString())
  })

  it('drops malformed faq/sources entries', () => {
    const p = parsePostFile('x', '---\nfaq:\n  - q: only\nsources:\n  - title: no url\n---\n', NOW)
    expect(p.faq).toEqual([])
    expect(p.sources).toEqual([])
  })
})

describe('helpers', () => {
  it('tagSlug', () => {
    expect(tagSlug('AI Ad Generator')).toBe('ai-ad-generator')
    expect(tagSlug('Meta/Facebook ads')).toBe('meta-facebook-ads')
  })
  it('ctaHref follows the contract', () => {
    expect(ctaHref('my-post', 'inline')).toBe('/?utm_source=blog&utm_medium=article&utm_campaign=my-post&utm_content=inline#studio-url')
  })
  it('resolveAuthor maps aliases', () => {
    expect(resolveAuthor('Komendly Team').slug).toBe('nolan-grout')
    expect(resolveAuthor(undefined).slug).toBe('nolan-grout')
  })
  it('related posts prefer same type + tags', () => {
    const base = parsePostFile('a', '---\ntype: comparison\ntags: [x]\n---\n', NOW)
    const b = parsePostFile('b', '---\ntype: comparison\ntags: [x]\n---\n', NOW)
    const c = parsePostFile('c', '---\ntype: guide\ntags: [x]\n---\n', NOW)
    const d = parsePostFile('d', '---\ntype: guide\ntags: [y]\n---\n', NOW)
    expect(getRelatedPosts(base, [base, d, c, b]).map((p) => p.slug)).toEqual(['b', 'c'])
  })
  it('existing content/blog posts all parse and are published', () => {
    const posts = getBlogPosts()
    expect(posts.length).toBeGreaterThan(0)
    for (const p of posts) expect(p.title).not.toBe('')
  })
})

describe('legacy dates', () => {
  it('falls back to publishDate, then filename date', () => {
    expect(parsePostFile('x', "---\npublishDate: '2026-01-05'\n---\n", NOW).date).toBe('2026-01-05T00:00:00.000Z')
    expect(parsePostFile('2026-01-03-foo', '---\ntitle: t\n---\n', NOW).date).toBe('2026-01-03T00:00:00.000Z')
  })
})
