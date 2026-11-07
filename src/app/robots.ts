import type { MetadataRoute } from 'next'
import { ALLOWED_BOTS, PRIVATE_PATHS } from '@/lib/seo/crawl'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  const disallow = [...PRIVATE_PATHS]
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      { userAgent: [...ALLOWED_BOTS], allow: '/', disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
