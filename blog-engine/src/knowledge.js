// Komendly product facts. Non-price facts: knowledge/komendly.md. Prices/credits: parsed at runtime from
// src/lib/ads/billing-config.ts on GitHub main (live prices); the knowledge file's fallback list is used if that fails.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gh as defaultGh, githubConfigured, repoName } from './github.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const KNOWLEDGE_PATH = path.join(ROOT, 'knowledge/komendly.md');
export const BILLING_CONFIG = 'src/lib/ads/billing-config.ts';

function parseLines(text) {
  const plans = [], topups = [];
  for (const line of String(text).split('\n')) {
    const m = line.match(/^-\s+(plan|topup):\s*(.+)$/);
    if (!m) continue;
    const parts = m[2].split('|').map((p) => p.trim());
    const f = Object.fromEntries(parts.slice(1).map((p) => { const i = p.indexOf(':'); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
    (m[1] === 'plan' ? plans : topups).push({ name: parts[0], price: Number(f.price), credits: Number(f.credits) });
  }
  return { plans, topups };
}

/** Parses ADS_PLANS / ADS_TOPUPS object literals from billing-config.ts. */
export function parseBillingConfig(ts) {
  const block = (name) => { const m = String(ts).match(new RegExp(`${name}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];?`)); return m ? m[1] : ''; };
  const objs = (src) => [...src.matchAll(/\{([^{}]*?(?:\[[^\]]*\][^{}]*?)?)\}/g)].map((m) => m[1]);
  const field = (o, k) => { const m = o.match(new RegExp(`\\b${k}:\\s*("([^"]*)"|'([^']*)'|(\\d+))`)); return m ? (m[4] ?? m[2] ?? m[3]) : null; };
  const plans = objs(block('ADS_PLANS')).map((o) => ({ name: field(o, 'name'), price: Number(field(o, 'priceCents')) / 100, credits: Number(field(o, 'monthlyCredits')) }))
    .filter((p) => p.name && Number.isFinite(p.price) && p.credits);
  const topups = objs(block('ADS_TOPUPS')).map((o) => ({ name: field(o, 'name'), price: Number(field(o, 'priceCents')) / 100, credits: Number(field(o, 'credits')) }))
    .filter((p) => p.name && Number.isFinite(p.price) && p.credits);
  return { plans, topups };
}

const priceLines = ({ plans, topups }) => ['## Prices (live, from billing-config.ts on main; monthly USD)',
  ...plans.map((p) => `- plan: ${p.name} | price: ${p.price} | credits: ${p.credits}`),
  ...topups.map((t) => `- topup: ${t.name} | price: ${t.price} | credits: ${t.credits}`)].join('\n');

/** Builds the knowledge object; `prices` from billing-config (null = use the file's fallback list). */
export function buildKnowledge(fileText, prices = null) {
  const nonPrice = String(fileText).split(/\n## Fallback prices/)[0].trim();
  const p = prices && prices.plans.length ? prices : parseLines(fileText);
  return { text: `${nonPrice}\n\n${priceLines(p)}`, plans: p.plans, topups: p.topups, source: prices && prices.plans.length ? 'billing-config.ts (main)' : 'fallback', trial: { staticAds: 10, animatedAds: 1 }, guaranteeDays: 30 };
}

export function loadKnowledge(file = KNOWLEDGE_PATH) { return buildKnowledge(readFileSync(file, 'utf8')); }

/** Runtime facts: billing-config.ts from GitHub main (via contents API), else fallback. */
export async function runtimeKnowledge(env = process.env, ghImpl = defaultGh) {
  const file = readFileSync(KNOWLEDGE_PATH, 'utf8');
  if (!githubConfigured(env)) return buildKnowledge(file);
  try {
    const f = await ghImpl('GET', `/repos/${repoName(env)}/contents/${BILLING_CONFIG}?ref=main`, null, env);
    return buildKnowledge(file, parseBillingConfig(Buffer.from(f.content || '', 'base64').toString('utf8')));
  } catch { return buildKnowledge(file); }
}

export function allowedNumbers(k) {
  const s = new Set(['10', '1', '30', '5', '3', '4', '9', '16', '0']);
  for (const p of [...k.plans, ...k.topups]) { s.add(String(p.price)); s.add(String(p.credits)); }
  return s;
}
export const allowedPrices = (k) => new Set([...k.plans, ...k.topups].map((p) => String(p.price)).concat(['0']));
