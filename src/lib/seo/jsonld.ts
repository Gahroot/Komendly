import { ADS_GUARANTEE, ADS_PLANS } from '@/lib/ads/billing-config'
import { authorUrl, type Author } from '@/lib/authors'
import type { BlogPostMeta, FaqItem } from '@/lib/blog'
import { stripFootnotes } from '@/lib/blog-content'
import { LOGO_URL, ORG_ID, SITE_NAME, SITE_URL, WEBSITE_ID, absoluteUrl } from '@/lib/site'

type JsonLd = Record<string, unknown>

/** Serialize for a <script type="application/ld+json">, escaping `<` so content can't close the tag. */
export function jsonLdString(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export function personId(author: Author): string {
  return `${authorUrl(author)}#person`
}

export function personJsonLd(author: Author): JsonLd {
  return {
    '@type': 'Person',
    '@id': personId(author),
    name: author.name,
    url: authorUrl(author),
    jobTitle: author.jobTitle,
    description: author.bio,
    worksFor: { '@id': ORG_ID },
    ...(author.image ? { image: absoluteUrl(author.image) } : {}),
    ...(author.sameAs.length ? { sameAs: author.sameAs } : {}),
  }
}

export function organizationJsonLd(founder: Author): JsonLd {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: { '@type': 'ImageObject', url: LOGO_URL },
    founder: { '@type': 'Person', '@id': personId(founder), name: founder.name, url: authorUrl(founder) },
    sameAs: [],
  }
}

export function websiteJsonLd(description: string): JsonLd {
  return { '@type': 'WebSite', '@id': WEBSITE_ID, url: SITE_URL, name: SITE_NAME, description, publisher: { '@id': ORG_ID } }
}

/** Website2ads product entity with real offers from billing-config. */
export function softwareApplicationJsonLd(): JsonLd {
  const dollars = (cents: number) => (cents / 100).toFixed(2)
  return {
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#website2ads`,
    name: 'Komendly Website2ads',
    alternateName: 'Ozzy, the Komendly AI ad wizard',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'AI ad creative generator',
    operatingSystem: 'Web',
    url: SITE_URL,
    description:
      'Paste a website URL and Ozzy, Komendly’s AI ad wizard, builds on-brand, ready-to-run static and animated ads in 4:5, 1:1 and 9:16 for every stage of awareness.',
    publisher: { '@id': ORG_ID },
    offers: [
      {
        '@type': 'Offer',
        name: 'Free trial',
        price: '0',
        priceCurrency: 'USD',
        description: '10 static ads + 1 animated ad. No card required.',
        url: SITE_URL,
      },
      ...ADS_PLANS.map((p) => ({
        '@type': 'Offer',
        name: `${p.name} plan`,
        price: dollars(p.priceCents),
        priceCurrency: 'USD',
        description: `${p.monthlyCredits} credits per month. ${ADS_GUARANTEE}`,
        url: `${SITE_URL}/ads/pricing`,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: dollars(p.priceCents),
          priceCurrency: 'USD',
          billingDuration: 'P1M',
          unitText: 'MONTH',
        },
      })),
    ],
  }
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>): JsonLd {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  }
}

export function faqJsonLd(faq: FaqItem[], pageUrl: string): JsonLd | null {
  if (!faq.length) return null
  return {
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: stripFootnotes(f.q),
      acceptedAnswer: { '@type': 'Answer', text: stripFootnotes(f.a) },
    })),
  }
}

export function blogPostingJsonLd(post: BlogPostMeta, author: Author, imageUrl: string): JsonLd {
  const url = absoluteUrl(`/blog/${post.slug}`)
  const isComparison = post.type === 'comparison' || post.type === 'alternatives'
  const things = post.competitors.map((name) => ({ '@type': 'Thing', name }))
  return {
    '@type': isComparison ? 'Article' : 'BlogPosting',
    '@id': `${url}#article`,
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated,
    author: { '@type': 'Person', '@id': personId(author), name: author.name, url: authorUrl(author) },
    publisher: { '@type': 'Organization', '@id': ORG_ID, name: SITE_NAME, logo: { '@type': 'ImageObject', url: LOGO_URL } },
    image: absoluteUrl(imageUrl),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    inLanguage: 'en',
    isPartOf: { '@type': 'Blog', '@id': `${SITE_URL}/blog#blog` },
    ...(post.tags.length ? { keywords: post.tags.join(', ') } : {}),
    ...(post.answer ? { abstract: stripFootnotes(post.answer) } : {}),
    ...(isComparison && things.length ? { about: things, mentions: [{ '@type': 'SoftwareApplication', '@id': `${SITE_URL}/#website2ads`, name: 'Komendly Website2ads' }, ...things] } : {}),
  }
}

export function itemListJsonLd(posts: BlogPostMeta[]): JsonLd {
  return {
    '@type': 'ItemList',
    itemListElement: posts.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: absoluteUrl(`/blog/${p.slug}`), name: p.title })),
  }
}

export function collectionPageJsonLd(opts: { name: string; description: string; path: string; posts: BlogPostMeta[] }): JsonLd {
  const url = absoluteUrl(opts.path)
  return {
    '@type': 'CollectionPage',
    '@id': url,
    url,
    name: opts.name,
    description: opts.description,
    isPartOf: { '@id': WEBSITE_ID },
    mainEntity: itemListJsonLd(opts.posts),
  }
}

export function blogJsonLd(description: string, posts: BlogPostMeta[]): JsonLd {
  const url = absoluteUrl('/blog')
  return {
    '@type': 'Blog',
    '@id': `${url}#blog`,
    url,
    name: 'The Komendly Journal',
    description,
    publisher: { '@id': ORG_ID },
    blogPost: posts.slice(0, 20).map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: absoluteUrl(`/blog/${p.slug}`),
      datePublished: p.date,
      dateModified: p.updated,
    })),
  }
}

export function profilePageJsonLd(author: Author, posts: BlogPostMeta[]): JsonLd {
  const url = authorUrl(author)
  return {
    '@type': 'ProfilePage',
    '@id': url,
    url,
    name: `${author.name}, ${author.jobTitle}`,
    mainEntity: personJsonLd(author),
    hasPart: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: absoluteUrl(`/blog/${p.slug}`) })),
  }
}

/** Wrap nodes in a single @graph document. Nulls are skipped. */
export function graph(...nodes: Array<JsonLd | null>): JsonLd {
  return { '@context': 'https://schema.org', '@graph': nodes.filter((n): n is JsonLd => n !== null) }
}
