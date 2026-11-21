'use strict';

const { BASE_URL, KEY_URL, UPGRADE_URL, VERSION } = require('./constants');

const url = (path) => `${BASE_URL}${path}`;

/** Every request: the user's personal API key as a Bearer token (Komendly's public agent API). */
const addApiKey = (request, z, bundle) => {
  request.headers = request.headers || {};
  if (bundle.authData && bundle.authData.api_key) {
    request.headers.Authorization = `Bearer ${String(bundle.authData.api_key).trim()}`;
  }
  request.headers['X-Komendly-Client'] = 'zapier';
  request.headers['User-Agent'] = `komendly-zapier/${VERSION}`;
  request.headers.Accept = 'application/json';
  return request;
};

const bodyOf = (response) => {
  try {
    return response.data && typeof response.data === 'object' ? response.data : JSON.parse(response.content || 'null') || {};
  } catch (e) {
    return {};
  }
};

/** Turn Komendly's `{ error, code, upgrade_url }` errors into one plain sentence a person (or an AI agent) can act on. */
const raiseFor = (response, z) => {
  if (response.status < 400) return response;
  const body = bodyOf(response);
  const msg = typeof body.error === 'string' && body.error.trim() ? body.error.trim() : null;
  const code = typeof body.code === 'string' ? body.code : `http_${response.status}`;
  if (response.status === 401) {
    throw new z.errors.Error(`Your Komendly API key is missing, invalid or revoked. Create a new one at ${KEY_URL} and reconnect Komendly in Zapier.`, 'AuthenticationError', 401);
  }
  if (response.status === 402 || code === 'locked' || code === 'trial_used' || code === 'insufficient_credits') {
    throw new z.errors.Error(`${msg || 'You need more credits for this.'} Upgrade or top up here: ${UPGRADE_URL}`, code, response.status);
  }
  if (response.status === 429 && code === 'rate_limited') {
    throw new z.errors.ThrottledError(msg || 'Too many requests. Wait a minute and try again.', 60);
  }
  throw new z.errors.Error(msg || `Komendly returned an error (HTTP ${response.status}). Please try again.`, code, response.status);
};

const handleErrors = (response, z) => (response.skipThrowForStatus ? response : raiseFor(response, z));

/** Bare host for website matching: "https://www.Acme.com/x" -> "acme.com". */
const hostOf = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return s.toLowerCase();
  }
};

/** GET /api/zapier/runs/:id -> run with ads and 7-day image links. */
const getRun = async (z, runId) => (await z.request({ url: url(`/api/zapier/runs/${encodeURIComponent(runId)}`) })).data;

/** Item from GET /api/ads/runs as a run object (used when the pack's details aren't loaded). */
const runFromSummary = (r) => ({
  id: r.id,
  run_id: r.id,
  website: r.url,
  status: r.status,
  done: ['completed', 'partial', 'failed', 'canceled'].includes(r.status),
  is_trial: Boolean(r.isTrial),
  created_at: r.createdAt,
  completed_at: null,
  ready_count: r.readyCount,
  total_count: r.totalCount,
  locked_count: 0,
  error: null,
  download_note: null,
  image_url: null,
  image_urls: [],
  ads: [],
  links_expire_at: null,
  view_url: `${BASE_URL}/ads/runs/${r.id}`,
  upgrade_url: UPGRADE_URL,
});

module.exports = { url, addApiKey, handleErrors, raiseFor, hostOf, getRun, runFromSummary };
