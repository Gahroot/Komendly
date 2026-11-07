// Seed files from the research worker: seed/topics.json (backlog) and seed/competitors.json. Absent = empty.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify } from './frontmatter.js';

const SEED_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seed');

export async function readSeed(name, dir = SEED_DIR) {
  try { const j = JSON.parse(await readFile(path.join(dir, name), 'utf8')); return Array.isArray(j) ? j : []; } catch { return []; }
}
export const loadCompetitors = (dir) => readSeed('competitors.json', dir);
export const loadTopics = (dir) => readSeed('topics.json', dir);

const TYPES = new Set(['guide', 'comparison', 'alternatives', 'question', 'listicle', 'glossary']);

/** Inserts seed topics not yet in the backlog (idempotent; never overwrites a drafted topic). */
export async function seedTopics(db, topics) {
  let added = 0;
  for (const t of topics) {
    if (!t || !t.primary_keyword) continue;
    const slug = slugify(t.slug || t.title || t.primary_keyword);
    if (!slug) continue;
    if ((await db.query('SELECT 1 FROM topics WHERE slug = $1', [slug])).rows.length) continue;
    const r = await db.query(
      `INSERT INTO topics (slug, title, type, primary_keyword, secondary_keywords, intent, funnel, priority, cta, competitors, angle, questions, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'seed') ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [slug, t.title || null, TYPES.has(t.type) ? t.type : 'guide', String(t.primary_keyword).toLowerCase(), JSON.stringify(t.secondary_keywords || []),
        t.intent || null, t.funnel || null, Math.min(5, Math.max(1, Number(t.priority) || 3)), t.cta === 'motion' ? 'motion' : 'ads',
        JSON.stringify(t.competitors || []), t.angle || null, JSON.stringify(t.questions || [])]);
    if (r.rows.length) added++;
  }
  return added;
}

/** Competitor facts for a topic (by name), for the draft prompt. */
export function competitorFacts(topic, competitors) {
  const names = (topic.competitors || []).map((n) => String(n).toLowerCase());
  return competitors.filter((c) => names.includes(String(c.name).toLowerCase()) || names.includes(String(c.slug).toLowerCase()));
}
