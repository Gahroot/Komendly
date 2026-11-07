// Postgres access + schema migrations (run on boot, idempotent). Own database (blog-db), never the Komendly app DB.
import pg from 'pg';

export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS job_runs (
    id SERIAL PRIMARY KEY, job TEXT NOT NULL, slot TIMESTAMPTZ NOT NULL, status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ, error TEXT, result JSONB)`,
  `CREATE INDEX IF NOT EXISTS job_runs_job_slot ON job_runs (job, slot)`,
  `CREATE TABLE IF NOT EXISTS topics (
    id SERIAL PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT, type TEXT NOT NULL DEFAULT 'guide',
    primary_keyword TEXT NOT NULL, secondary_keywords JSONB, intent TEXT, funnel TEXT, priority INTEGER NOT NULL DEFAULT 3,
    cta TEXT NOT NULL DEFAULT 'ads', competitors JSONB, angle TEXT, questions JSONB, source TEXT NOT NULL DEFAULT 'seed',
    status TEXT NOT NULL DEFAULT 'open', post_slug TEXT, impressions INTEGER, position REAL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS posts (
    slug TEXT PRIMARY KEY, title TEXT, primary_keyword TEXT, status TEXT NOT NULL DEFAULT 'draft', pr_number INTEGER, pr_url TEXT,
    branch TEXT, kind TEXT NOT NULL DEFAULT 'new', index_status TEXT, draft_md TEXT, topic_id INTEGER, file TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS metrics_daily (
    day DATE NOT NULL, provider TEXT NOT NULL, page TEXT NOT NULL DEFAULT '', query TEXT NOT NULL DEFAULT '',
    clicks INTEGER NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0, ctr REAL, position REAL, PRIMARY KEY (day, provider, page, query))`,
  `CREATE TABLE IF NOT EXISTS ai_visibility (
    id SERIAL PRIMARY KEY, day DATE NOT NULL, provider TEXT NOT NULL, question TEXT NOT NULL, cited BOOLEAN NOT NULL DEFAULT false,
    mentioned BOOLEAN NOT NULL DEFAULT false, recommended BOOLEAN NOT NULL DEFAULT false, citations JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS reports (id SERIAL PRIMARY KEY, week_of DATE NOT NULL, body TEXT NOT NULL, issue_url TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS checks (id SERIAL PRIMARY KEY, day DATE NOT NULL, name TEXT NOT NULL, ok BOOLEAN NOT NULL, detail TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS gate_results (
    id SERIAL PRIMARY KEY, pr_number INTEGER NOT NULL, slugs TEXT, head_sha TEXT, outcome TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'auto',
    checks JSONB, verdicts JSONB, detail TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS ai_usage (
    id SERIAL PRIMARY KEY, job TEXT NOT NULL, provider TEXT NOT NULL, model TEXT, input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0, cache_read_tokens INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS optimize_suggestions (id SERIAL PRIMARY KEY, slug TEXT NOT NULL, suggestion JSONB NOT NULL, used BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS claim_checks (key TEXT PRIMARY KEY, verdict TEXT NOT NULL, reason TEXT, checked_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS source_cache (url TEXT PRIMARY KEY, text TEXT NOT NULL, fetched_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS codex_state (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS post_audits (id SERIAL PRIMARY KEY, slug TEXT NOT NULL, ok BOOLEAN NOT NULL, detail TEXT, pr_number INT, checked_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS indexnow_pings (id SERIAL PRIMARY KEY, url TEXT NOT NULL, status INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`
];

export async function migrate(db) {
  await db.query(MIGRATIONS[0]);
  const { rows } = await db.query('SELECT version FROM schema_migrations');
  const done = new Set(rows.map((r) => Number(r.version)));
  for (let i = 1; i < MIGRATIONS.length; i++) {
    if (done.has(i)) continue;
    await db.query(MIGRATIONS[i]);
    await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [i]);
  }
}

export function createPool(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set');
  const local = /localhost|127\.0\.0\.1|\.railway\.internal/.test(url);
  return new pg.Pool({ connectionString: url, max: 5, ssl: local ? false : { rejectUnauthorized: false } });
}

export async function dbConnected(db) {
  try { await db.query('SELECT 1'); return true; } catch { return false; }
}
