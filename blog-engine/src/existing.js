// Posts already in content/blog on main (+ pending/published DB rows): avoids duplicates/cannibalisation and feeds internal links.
import { githubConfigured, listMainPosts, gh } from './github.js';
import { parsePost } from './frontmatter.js';

const STOP = new Set(['a', 'an', 'the', 'i', 'do', 'does', 'my', 'me', 'you', 'your', 'is', 'are', 'at', 'in', 'on', 'of', 'to', 'for', 'and', 'or',
  'why', 'what', 'how', 'when', 'can', 'get', 'it', 'with', 'about', 'should', 'will', 'which', 'best', 'top', 'guide', '2025', '2026', '2027', 'vs', 'versus']);

export function terms(text) {
  const t = String(text || '').toLowerCase().replace(/\.ai\b/g, ' ai').replace(/[^a-z0-9\s]/g, ' ');
  const out = new Set();
  for (let w of t.split(/\s+/)) {
    if (!w || STOP.has(w)) continue;
    if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
    else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    if (w === 'alternative' || w === 'alternativ') w = 'alternative';
    out.add(w);
  }
  return out;
}

export function similarity(a, b) {
  const x = terms(a), y = terms(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter);
}

/** The existing article a topic would duplicate, or null (exact slug match, or Jaccard >= threshold on keyword/title). */
export function duplicateOf(candidate, articles, threshold = 0.6) {
  let best = null;
  for (const a of articles) {
    if (candidate.slug && a.slug === candidate.slug) return { slug: a.slug, title: a.title, matched: 'slug', score: 1 };
    for (const k of [a.title, a.primary_keyword, ...(a.secondary_keywords || [])]) {
      for (const c of [candidate.keyword || candidate.primary_keyword, candidate.title]) {
        if (!c || !k) continue;
        const s = similarity(c, k);
        if (s >= threshold && (!best || s > best.score)) best = { slug: a.slug, title: a.title, matched: k, score: Math.round(s * 100) / 100 };
      }
    }
  }
  return best;
}

/** Best internal-link candidates for a topic (most related first). */
export function relatedArticles(topic, articles, n = 6) {
  const q = [topic.title, topic.primary_keyword, ...(topic.secondary_keywords || []), ...(topic.competitors || [])].join(' ');
  return articles.filter((a) => a.slug !== topic.slug && a.published !== false)
    .map((a) => ({ ...a, score: similarity(q, [a.title, a.primary_keyword, ...(a.tags || [])].join(' ')) }))
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug)).slice(0, n);
}

export async function existingArticles({ db, env = process.env, ghImpl = gh } = {}) {
  const out = [];
  if (githubConfigured(env)) {
    try {
      for (const f of await listMainPosts(env, ghImpl)) {
        try {
          const p = parsePost(f.text);
          out.push({ slug: p.slug || f.name.replace(/\.mdx?$/, ''), file: f.path, title: p.title, primary_keyword: p.primary_keyword || '', secondary_keywords: p.secondary_keywords || [], tags: p.tags || [], published: p.published !== false, description: p.description || '' });
        } catch { /* unreadable file must not hide the rest */ }
      }
    } catch { /* GitHub down: DB list only */ }
  }
  if (db) {
    const rows = (await db.query("SELECT slug, title, primary_keyword FROM posts WHERE status IN ('pending','draft','published','approved')")).rows;
    for (const r of rows) if (!out.some((a) => a.slug === r.slug)) out.push({ slug: r.slug, title: r.title, primary_keyword: r.primary_keyword, secondary_keywords: [], tags: [], published: false });
  }
  return out;
}
