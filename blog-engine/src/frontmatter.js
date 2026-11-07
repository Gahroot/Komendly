// CONTRACT.md post format: YAML frontmatter + Markdown body.
import YAML from 'yaml';

const one = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
export const slugify = (s) => one(s).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');

export const ORDER = ['title', 'slug', 'description', 'date', 'updated', 'author', 'type', 'tags', 'published', 'status', 'approved_by',
  'primary_keyword', 'secondary_keywords', 'answer', 'key_takeaways', 'competitors', 'cta', 'faq', 'sources', 'claims'];

const isDate = (v) => v instanceof Date;
const dateStr = (v) => (isDate(v) ? v.toISOString().slice(0, 10) : v);

/** Normalises parsed YAML (Date objects -> YYYY-MM-DD strings). */
function normalise(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (Array.isArray(v)) out[k] = v.map((x) => (x && typeof x === 'object' && !isDate(x) ? Object.fromEntries(Object.entries(x).map(([a, b]) => [a, dateStr(b)])) : dateStr(x)));
    else out[k] = dateStr(v);
  }
  return out;
}

export function splitFrontmatter(text) {
  const m = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('no frontmatter');
  return { yaml: m[1], body: m[2].replace(/^\n/, '') };
}

export function parsePost(text) {
  const { yaml, body } = splitFrontmatter(text);
  const data = normalise(YAML.parse(yaml, { schema: 'core' }) || {});
  return { ...data, body };
}

export function serializePost(post) {
  const data = {};
  for (const k of ORDER) {
    let v = post[k];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && !v.length && !['sources', 'claims'].includes(k)) continue;
    if (k === 'sources') v = v.map((s) => ({ id: Number(s.id), title: one(s.title), ...(s.publisher ? { publisher: one(s.publisher) } : {}), url: one(s.url), accessed: one(s.accessed) }));
    if (k === 'claims') v = v.map((c) => ({ text: one(c.text), source: c.source === '' || c.source == null ? null : Number(c.source) }));
    if (k === 'faq') v = v.map((f) => ({ q: one(f.q), a: one(f.a) }));
    data[k] = v;
  }
  const y = YAML.stringify(data, { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN' })
    // dates and booleans/numbers stay plain
    .replace(/^(date|updated): "(\d{4}-\d{2}-\d{2})"$/gm, '$1: $2')
    .replace(/^(\s+accessed): "(\d{4}-\d{2}-\d{2})"$/gm, '$1: $2');
  return `---\n${y}---\n\n${String(post.body || '').trim()}\n`;
}

/**
 * Sets published/status/approved_by at merge time. No backdating: a NEW post gets date = updated = the real publish day;
 * a refresh keeps its original `date` (originalDate) and only bumps `updated`.
 */
export function setApproval(text, approver, today, { originalDate = null } = {}) {
  const p = parsePost(text);
  return serializePost({ ...p, published: true, status: 'approved', approved_by: approver, date: originalDate || today, updated: today });
}

/**
 * Date rule (owner, no backdating): `date` never in the future, never earlier than the PR's creation day for a new post;
 * a refresh must keep the original date unchanged. `updated` never in the future and never before `date`.
 */
export function dateIssues(post, { today, prCreatedDay = null, originalDate = null }) {
  const e = [];
  const d = String(post.date || ''), u = String(post.updated || '');
  if (d > today) e.push(`date ${d} is in the future`);
  if (u > today) e.push(`updated ${u} is in the future`);
  if (originalDate) { if (d !== originalDate) e.push(`refresh changed the original date ${originalDate} to ${d}`); }
  else if (prCreatedDay && d < prCreatedDay) e.push(`date ${d} is earlier than the PR creation day ${prCreatedDay} (no backdating)`);
  return e;
}

export function dropSources(post, dropIds) {
  const drop = new Set(dropIds.map(String));
  if (!drop.size) return post;
  const strip = (s) => String(s || '').replace(/\[\^(\d+)\]/g, (m, id) => (drop.has(id) ? '' : m));
  return {
    ...post,
    body: strip(post.body),
    answer: strip(post.answer),
    faq: (post.faq || []).map((f) => ({ ...f, a: strip(f.a) })),
    sources: (post.sources || []).filter((s) => !drop.has(String(s.id))),
    claims: (post.claims || []).map((c) => (drop.has(String(c.source)) ? { ...c, source: '' } : c))
  };
}

export function citedIds(text) {
  return [...new Set([...String(text).matchAll(/\[\^(\d+)\]/g)].map((m) => m[1]))];
}
