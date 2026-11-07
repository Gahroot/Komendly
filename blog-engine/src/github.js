// GitHub REST (fetch) + git CLI helpers. The token is only ever passed via env/URL to git, never logged.
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
export const CONTENT_DIR = 'content/blog';

export const repoName = (env = process.env) => env.GITHUB_REPO || 'Gahroot/Komendly';
export const githubConfigured = (env = process.env) => Boolean(env.GITHUB_TOKEN);

export async function gh(method, route, body, env = process.env) {
  const res = await fetch(`https://api.github.com${route}`, {
    method,
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'komendly-blog-engine', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000)
  });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`GitHub ${method} ${route} -> ${res.status}: ${text.slice(0, 300)}`), { status: res.status });
  return text ? JSON.parse(text) : null;
}

/** Light check for /api/admin/status: can the token read the repo? Never returns the token. */
export async function githubStatus(env = process.env, ghImpl = gh) {
  if (!githubConfigured(env)) return { configured: false };
  try {
    const r = await ghImpl('GET', `/repos/${repoName(env)}`, null, env);
    return { configured: true, ok: true, repo: r.full_name, defaultBranch: r.default_branch, push: r.permissions ? Boolean(r.permissions.push) : null };
  } catch (e) { return { configured: true, ok: false, error: String(e.message).slice(0, 200) }; }
}

const scrub = (s, env) => String(s).split(env.GITHUB_TOKEN || '\u0000').join('***');

export async function git(cwd, args, env = process.env) {
  try {
    const { stdout } = await run('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, maxBuffer: 20 * 1024 * 1024 });
    return stdout.trim();
  } catch (e) {
    throw new Error(`git ${args[0]} failed: ${scrub(e.stderr || e.message, env).slice(0, 500)}`);
  }
}

/** Shallow, sparse (content/blog only) clone into a temp dir; calls fn(dir); always cleans up. */
export async function withCheckout(fn, { branch, env = process.env } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'kblog-'));
  try {
    const url = `https://x-access-token:${env.GITHUB_TOKEN}@github.com/${repoName(env)}.git`;
    await git(tmpdir(), ['clone', '--depth', '5', '--filter=blob:none', '--sparse', ...(branch ? ['--branch', branch] : []), url, dir], env);
    await git(dir, ['sparse-checkout', 'set', '--no-cone', `/${CONTENT_DIR}/`, '/src/lib/ads/billing-config.ts'], env);
    await git(dir, ['config', 'user.name', env.GIT_AUTHOR_NAME || 'Komendly blog engine']);
    await git(dir, ['config', 'user.email', env.GIT_AUTHOR_EMAIL || 'blog-engine@komendly.com']);
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const headSha = (dir) => git(dir, ['rev-parse', 'HEAD']);

export async function commitAndPush(dir, branch, message, env = process.env) {
  await git(dir, ['add', '-A', CONTENT_DIR], env);
  const status = await git(dir, ['status', '--porcelain', CONTENT_DIR]);
  if (!status) return false;
  await git(dir, ['commit', '-m', message], env);
  await git(dir, ['push', 'origin', `HEAD:refs/heads/${branch}`], env);
  return true;
}

/** Opens or updates (comments on) a GitHub issue with the given label + exact title. */
export async function upsertIssue({ title, body, label, assignees }, env = process.env) {
  const repo = repoName(env);
  try { await gh('POST', `/repos/${repo}/labels`, { name: label, color: label === 'engine-alert' || label === 'needs-review' ? 'd73a4a' : '0e8a16' }, env); } catch {}
  const open = await gh('GET', `/repos/${repo}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100`, null, env);
  const existing = open.find((i) => i.title === title && !i.pull_request);
  if (existing) {
    await gh('POST', `/repos/${repo}/issues/${existing.number}/comments`, { body }, env);
    return existing.html_url;
  }
  const created = await gh('POST', `/repos/${repo}/issues`, { title, body, labels: [label], ...(assignees ? { assignees } : {}) }, env);
  return created.html_url;
}

/** All post files on main: [{ name, path, text }] */
export async function listMainPosts(env = process.env, ghImpl = gh) {
  const repo = repoName(env);
  const files = await ghImpl('GET', `/repos/${repo}/contents/${CONTENT_DIR}?ref=main`, null, env);
  const out = [];
  for (const f of Array.isArray(files) ? files : []) {
    if (!/\.mdx?$/.test(f.name)) continue;
    const file = await ghImpl('GET', `/repos/${repo}/contents/${CONTENT_DIR}/${encodeURIComponent(f.name)}?ref=main`, null, env);
    out.push({ name: f.name, path: `${CONTENT_DIR}/${f.name}`, text: Buffer.from(file.content || '', 'base64').toString('utf8') });
  }
  return out;
}
