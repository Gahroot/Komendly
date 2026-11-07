// Every 2 weeks (Wed, even ISO weeks): ask ChatGPT (Codex with live web search) target questions and record whether
// komendly.com is cited, Komendly mentioned, or recommended.
import { tryCodex, llmConfigured } from '../llm.js';

export const maxQuestions = (env = process.env) => Math.max(1, Number(env.AI_VIS_MAX_QUESTIONS) || 12);

export function nyCalendar(d = new Date()) {
  const [y, m, day] = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, day));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  return { isoWeek: Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7), dayOfMonth: day };
}

export const BASE_QUESTIONS = [
  'What is the best AI ad generator for a small business?',
  'How can I turn my website into Facebook ads automatically?',
  'What are the best AdCreative.ai alternatives?',
  'How do I launch a mass ad campaign on Meta?',
  'Which AI tool makes animated video ads from a website URL?',
  'Is there a free AI ad generator with no credit card?'
];

export function detect(text, citations = [], domain = 'komendly.com') {
  const cited = citations.some((c) => String(c).toLowerCase().includes(domain));
  const t = String(text).toLowerCase();
  const mentioned = cited || t.includes(domain) || /\bkomendly\b/.test(t);
  const recommended = mentioned && /\bkomendly\b[^.]{0,120}\b(best|recommend|top pick|great|good option|worth|ideal|try)\b|\b(recommend|best|top pick|try)\b[^.]{0,80}\bkomendly\b/.test(t);
  return { cited, mentioned, recommended };
}

async function codexSearch(env, q, db) {
  const r = await tryCodex('', `Answer this question the way ChatGPT search would for a member of the public. Search the web, give a concise answer with specific tool recommendations, and end with a list of the URLs of the sources you relied on.\n\nQuestion: ${q}`,
    { db, env, job: 'ai_visibility', search: true, full: true });
  const inText = String(r.text).match(/https?:\/\/[^\s)\]>"']+/g) || [];
  return { text: r.text, citations: [...new Set([...(r.urls || []), ...inText])] };
}

export async function run({ db, env = process.env, log = console, slot, deps = {} }) {
  const { isoWeek } = nyCalendar(slot || new Date());
  if (isoWeek % 2 !== 0 && !deps.force) return { skipped: `odd ISO week ${isoWeek} (runs every 2 weeks)` };
  if (!llmConfigured(env)) return { skipped: 'not configured: LLM_PROVIDER_ORDER must be codex' };
  const ask = deps.ask || codexSearch;
  const fromTopics = (await db.query("SELECT questions FROM topics WHERE priority = 1 ORDER BY id LIMIT 10")).rows
    .flatMap((r) => { try { return (Array.isArray(r.questions) ? r.questions : JSON.parse(r.questions || '[]')).slice(0, 1); } catch { return []; } });
  const questions = [...new Set([...BASE_QUESTIONS, ...fromTopics])].slice(0, maxQuestions(env));
  let cited = 0, mentioned = 0, recommended = 0, errors = 0;
  for (const q of questions) {
    try {
      const r = await ask(env, q, db);
      const dct = detect(r.text, r.citations);
      cited += dct.cited; mentioned += dct.mentioned; recommended += dct.recommended;
      await db.query('INSERT INTO ai_visibility (day, provider, question, cited, mentioned, recommended, citations) VALUES (CURRENT_DATE,$1,$2,$3,$4,$5,$6)',
        ['chatgpt-codex', q, dct.cited, dct.mentioned, dct.recommended, JSON.stringify(r.citations.slice(0, 20))]);
    } catch (e) {
      if (e && e.defer) throw e;
      errors++; log.error('[ai_visibility]', e.message);
    }
  }
  if (errors === questions.length) throw Object.assign(new Error('ai_visibility: all queries failed'), { retryable: true });
  return { questions: questions.length, cited, mentioned, recommended, errors };
}
