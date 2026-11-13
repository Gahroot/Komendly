/** Private (signed-in, transactional or internal) paths: disallowed in robots.txt and sent with X-Robots-Tag: noindex. */
export const PRIVATE_PATHS = [
  '/api/',
  '/admin',
  '/dashboard',
  '/ads/app',
  '/ads/billing',
  '/ads/brands',
  '/ads/runs',
  '/ads/start',
  '/ads/refer',
  '/ads/gifts',
  '/ads/coach',
  '/checkout',
  '/test-video',
  '/ozzy-lab',
] as const

/** Crawlable but not worth indexing (auth forms, email confirmation): noindex via metadata/header, not robots.txt. */
export const NOINDEX_PATHS = ['/login', '/register', '/ads/login', '/ads/signup', '/verify-email', '/r/', '/gift/'] as const

/** Search and AI answer-engine crawlers explicitly welcomed on public pages. */
export const ALLOWED_BOTS = [
  'Googlebot',
  'Bingbot',
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'Google-Extended',
  'Applebot',
  'Applebot-Extended',
  'DuckDuckBot',
] as const
