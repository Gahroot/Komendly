// Shared: write a post into a fresh checkout, push a blog/ branch and open a PR.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { withCheckout, commitAndPush, gh, git, repoName, CONTENT_DIR } from '../github.js';
import { autoPublish } from './gate.js';

export function prBody({ post, file, dropped = [], kind = 'new', reason = '', notes = '', auto = true }) {
  const claims = (post.claims || []).map((c) => {
    const src = (post.sources || []).find((s) => String(s.id) === String(c.source));
    return `- [ ] ${c.text} ${src ? `([^${src.id}] [${src.title}](${src.url}))` : '**UNSOURCED**'}`;
  });
  return [
    kind === 'refresh' ? `Refresh of **${post.title}** (${reason}).` : `New post: **${post.title}** (${post.type})`,
    '', `Primary keyword: \`${post.primary_keyword}\` · file: \`${file}\` · URL after merge: https://komendly.com/blog/${post.slug}`,
    '', '## Claims', ...claims,
    '', '## Sources', ...(post.sources || []).map((s) => `- [^${s.id}] ${s.title}${s.publisher ? `, ${s.publisher}` : ''}: ${s.url}`),
    ...(dropped.length ? ['', '### Dropped (could not be verified)', ...dropped.map((d) => `- ${d.source.url} (${d.reason})`)] : []),
    notes, '',
    ...(auto ? ['## Automated approval gate',
      'The engine checks: sources resolve, CONTRACT.md validator, Komendly claims lint, and an independent fact-check (separate Codex session). All pass: it sets `published: true`, `status: approved`, the real publish date, waits for the Vercel preview to be green, squash-merges (production deploy) and pings IndexNow. Any fail: `needs-review` label + issue.',
      'Manual override: the repo owner comments `/approve`.']
      : ['Comment `/approve` (repo owner) to approve; a person merges.'])
  ].join('\n');
}

export async function openPostPr({ db, env, post, fileText, dropped = [], kind = 'new', reason = '', notes = '', log = console, file: existingFile }) {
  const repo = repoName(env);
  const branch = `blog/${post.slug}${kind === 'refresh' ? '-refresh-' + new Date().toISOString().slice(0, 10) : ''}`;
  const file = existingFile || `${CONTENT_DIR}/${post.slug}.md`;
  const pushed = await withCheckout(async (dir) => {
    await git(dir, ['checkout', '-B', branch]);
    await mkdir(path.join(dir, CONTENT_DIR), { recursive: true });
    await writeFile(path.join(dir, file), fileText);
    return commitAndPush(dir, branch, `${kind === 'refresh' ? 'Refresh' : 'Draft'} post: ${post.title}`, env);
  }, { env });
  if (!pushed) return { skipped: 'no changes' };
  const base = (await gh('GET', `/repos/${repo}`, null, env)).default_branch;
  const pr = await gh('POST', `/repos/${repo}/pulls`, {
    title: `${kind === 'refresh' ? 'Blog refresh' : 'Blog'}: ${post.title}`, head: branch, base,
    body: prBody({ post, file, dropped, kind, reason, notes, auto: autoPublish(env) })
  }, env);
  try { await gh('POST', `/repos/${repo}/issues/${pr.number}/labels`, { labels: ['blog-post'] }, env); } catch {}
  await db.query(
    `INSERT INTO posts (slug, title, primary_keyword, status, pr_number, pr_url, branch, kind, file) VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8)
     ON CONFLICT (slug) DO UPDATE SET status = CASE WHEN posts.status IN ('pending','draft') THEN 'draft' ELSE posts.status END, pr_number = EXCLUDED.pr_number, pr_url = EXCLUDED.pr_url, branch = EXCLUDED.branch, kind = EXCLUDED.kind, file = EXCLUDED.file, updated_at = now()`,
    [post.slug, post.title, post.primary_keyword, pr.number, pr.html_url, branch, kind, file]);
  log.log(`[publish] opened ${pr.html_url}`);
  return { pr: pr.html_url, number: pr.number, branch, dropped: dropped.length };
}
