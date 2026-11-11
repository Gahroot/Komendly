// Engine-local validator for CONTRACT.md (no Komendly npm install needed): frontmatter shape + MDX safety.
import { citedIds } from './frontmatter.js';

export const TYPES = ['guide', 'comparison', 'alternatives', 'question', 'listicle', 'glossary'];
export const CTAS = ['ads', 'motion'];
export const AUTHOR = 'Nolan Grout';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;

/** Body with fenced code blocks and inline code spans removed (they may contain < and {). */
export function stripCode(md) {
  return String(md || '').replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '').replace(/(`+)[^`\n]*?\1/g, '');
}

/** MDX-safety problems: raw HTML/JSX, `<`, `{`, `}` outside code, footnote definitions, imports/exports. */
export function mdxIssues(md) {
  const issues = [];
  const t = stripCode(md);
  t.split('\n').forEach((line, i) => {
    if (/[<>]/.test(line.replace(/^\s*>+\s?/, ''))) issues.push(`line ${i + 1}: "<" or ">" outside code (raw HTML/JSX not allowed)`);
    if (/[{}]/.test(line)) issues.push(`line ${i + 1}: "{" or "}" outside code`);
    if (/^\s*(import|export)\s/.test(line)) issues.push(`line ${i + 1}: import/export statement`);
    if (/^\s*\[\^\d+\]:/.test(line)) issues.push(`line ${i + 1}: footnote definition in body (sources come from frontmatter)`);
  });
  return issues;
}

/**
 * Validates a parsed post against CONTRACT.md.
 * opts: { filename (e.g. "content/blog/x.md"), knownSlugs (Set of existing slugs for internal-link checks), requireApproved }
 */
export function validatePost(post, { filename, knownSlugs, requireApproved = false } = {}) {
  const e = [];
  const req = ['title', 'slug', 'description', 'date', 'updated', 'author', 'type', 'primary_keyword', 'answer', 'cta'];
  for (const k of req) if (post[k] === undefined || post[k] === null || String(post[k]).trim() === '') e.push(`missing ${k}`);
  if (filename) {
    const base = filename.split('/').pop().replace(/\.mdx?$/, '');
    if (post.slug !== base) e.push(`slug "${post.slug}" does not match filename "${base}"`);
  }
  if (post.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(post.slug)) e.push('slug must be lowercase kebab-case');
  if (post.title && String(post.title).length > 75) e.push(`title is ${String(post.title).length} chars (max 75, ideal <= 65)`);
  const dl = String(post.description || '').length;
  if (dl < 120 || dl > 160) e.push(`description is ${dl} chars (120-160)`);
  for (const k of ['date', 'updated']) if (post[k] && !DATE.test(String(post[k]))) e.push(`${k} must be YYYY-MM-DD`);
  if (post.date && post.updated && String(post.updated) < String(post.date)) e.push('updated is before date');
  if (post.author && post.author !== AUTHOR) e.push(`author must be "${AUTHOR}"`);
  if (post.type && !TYPES.includes(post.type)) e.push(`type "${post.type}" not one of ${TYPES.join('|')}`);
  if (post.cta && !CTAS.includes(post.cta)) e.push(`cta "${post.cta}" not one of ${CTAS.join('|')}`);
  if (typeof post.published !== 'boolean') e.push('published must be true or false');
  if (post.status && !['draft', 'approved'].includes(post.status)) e.push('status must be draft|approved');
  if (requireApproved && (post.status !== 'approved' || post.published !== true || !post.approved_by)) e.push('not approved (status/published/approved_by)');
  const aw = words(post.answer);
  if (aw < 40 || aw > 70) e.push(`answer is ${aw} words (40-70)`);
  for (const k of ['tags', 'secondary_keywords', 'key_takeaways', 'competitors']) if (post[k] !== undefined && !Array.isArray(post[k])) e.push(`${k} must be a list`);
  if (['comparison', 'alternatives'].includes(post.type) && !(Array.isArray(post.competitors) && post.competitors.length)) e.push(`${post.type} post needs competitors`);
  if (!Array.isArray(post.faq) || !post.faq.length) e.push('faq is empty');
  for (const f of post.faq || []) if (!f || !f.q || !f.a) e.push('faq item needs q and a');

  const sources = Array.isArray(post.sources) ? post.sources : [];
  if (!sources.length) e.push('no sources');
  const ids = new Set();
  for (const s of sources) {
    if (!Number.isInteger(Number(s.id)) || Number(s.id) < 1) e.push(`source id "${s.id}" must be a positive integer`);
    if (ids.has(String(s.id))) e.push(`duplicate source id ${s.id}`);
    ids.add(String(s.id));
    if (!s.title) e.push(`source ${s.id} has no title`);
    if (!/^https:\/\//.test(String(s.url || ''))) e.push(`source ${s.id} url must be https`);
    if (!s.accessed || !DATE.test(String(s.accessed))) e.push(`source ${s.id} needs accessed: YYYY-MM-DD`);
  }
  const allText = [post.body, post.answer, ...(post.faq || []).map((f) => f && f.a), ...(post.key_takeaways || [])].join('\n');
  for (const id of citedIds(allText)) if (!ids.has(id)) e.push(`citation [^${id}] has no source`);
  const claims = Array.isArray(post.claims) ? post.claims : [];
  if (!claims.length) e.push('no claims listed');
  for (const c of claims) {
    if (!c || !c.text) { e.push('claim without text'); continue; }
    if (c.source === '' || c.source == null || !ids.has(String(c.source))) e.push(`unsourced claim: ${c.text}`);
  }
  const body = String(post.body || '');
  if (!body.trim()) e.push('empty body');
  if (/^#\s/m.test(stripCode(body))) e.push('body must not contain an H1 (the title is the H1)');
  e.push(...mdxIssues(body));
  for (const [k, v] of [['answer', post.answer], ['title', post.title], ['description', post.description], ...(post.faq || []).flatMap((f, i) => [[`faq ${i + 1}`, f && f.q], [`faq ${i + 1}`, f && f.a]])]) {
    if (/[<>{}]/.test(String(v || ''))) e.push(`${k}: "<", ">", "{" or "}" not allowed`);
  }
  if (knownSlugs) {
    for (const m of stripCode(body).matchAll(/\]\((\/blog\/([a-z0-9-]+))\/?(?:#[^)]*)?\)/g)) {
      if (m[2] !== post.slug && !knownSlugs.has(m[2])) e.push(`internal link ${m[1]} points to a post that does not exist`);
    }
  }
  return [...new Set(e)];
}
