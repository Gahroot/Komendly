import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import readingTime from 'reading-time'

const BLOG_DIR = path.join(process.cwd(), 'content/blog')

export interface BlogPost {
  slug: string
  title: string
  description: string
  date: string
  author: string
  image?: string
  tags: string[]
  published: boolean
  readingTime: string
  content: string
}

export interface BlogPostMeta {
  slug: string
  title: string
  description: string
  date: string
  author: string
  image?: string
  tags: string[]
  published: boolean
  readingTime: string
}

/**
 * Get all blog posts metadata (without content)
 */
export function getBlogPosts(): BlogPostMeta[] {
  if (!fs.existsSync(BLOG_DIR)) {
    return []
  }

  const files = fs.readdirSync(BLOG_DIR).filter((file) => file.endsWith('.mdx'))

  const posts = files
    .map((file) => {
      const slug = file.replace(/\.mdx$/, '')
      const filePath = path.join(BLOG_DIR, file)
      const fileContent = fs.readFileSync(filePath, 'utf-8')
      const { data, content } = matter(fileContent)
      const stats = readingTime(content)

      return {
        slug,
        title: data.title || slug,
        description: data.description || '',
        date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
        author: data.author || 'Komendly Team',
        image: data.image,
        tags: data.tags || [],
        published: data.published !== false,
        readingTime: stats.text,
      }
    })
    .filter((post) => post.published)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return posts
}

/**
 * Get a single blog post by slug (with content)
 */
export function getBlogPost(slug: string): BlogPost | null {
  const filePath = path.join(BLOG_DIR, `${slug}.mdx`)

  if (!fs.existsSync(filePath)) {
    return null
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8')
  const { data, content } = matter(fileContent)
  const stats = readingTime(content)

  const post: BlogPost = {
    slug,
    title: data.title || slug,
    description: data.description || '',
    date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
    author: data.author || 'Komendly Team',
    image: data.image,
    tags: data.tags || [],
    published: data.published !== false,
    readingTime: stats.text,
    content,
  }

  return post.published ? post : null
}

/**
 * Get all blog post slugs for static generation
 */
export function getBlogSlugs(): string[] {
  if (!fs.existsSync(BLOG_DIR)) {
    return []
  }

  return fs
    .readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith('.mdx'))
    .map((file) => file.replace(/\.mdx$/, ''))
}

/**
 * Get posts by tag
 */
export function getBlogPostsByTag(tag: string): BlogPostMeta[] {
  return getBlogPosts().filter((post) =>
    post.tags.map((t) => t.toLowerCase()).includes(tag.toLowerCase())
  )
}

/**
 * Get all unique tags
 */
export function getAllTags(): string[] {
  const posts = getBlogPosts()
  const tags = new Set<string>()

  posts.forEach((post) => {
    post.tags.forEach((tag) => tags.add(tag))
  })

  return Array.from(tags).sort()
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
