'use strict';

const { url, getRun, hostOf, raiseFor } = require('../lib/http');
const { runSample, runOutputFields } = require('../lib/samples');

const perform = async (z, bundle) => {
  const runId = String(bundle.inputData.run_id || '').trim();
  if (runId) {
    const res = await z.request({ url: url(`/api/zapier/runs/${encodeURIComponent(runId)}`), skipThrowForStatus: true });
    if (res.status === 404) return [];
    return [raiseFor(res, z).data];
  }
  const host = hostOf(bundle.inputData.website);
  if (!host) throw new z.errors.Error('Give an Ad Pack ID or a website URL to search for.', 'invalid_input', 400);
  const { runs } = (await z.request({ url: url('/api/ads/runs') })).data;
  const match = (runs || []).find((r) => hostOf(r.url) === host); // newest first
  return match ? [await getRun(z, match.id)] : [];
};

module.exports = {
  key: 'find_run',
  noun: 'Ad Pack',
  display: {
    label: 'Find Ad Pack',
    description: 'Finds an Ad Pack by ID, or the newest one for a website, with its ads, image links and status.',
  },
  operation: {
    inputFields: [
      { key: 'run_id', label: 'Ad Pack ID', required: false, dynamic: 'new_run.id.website', helpText: 'The `id` from "Generate Ads From a Website". Takes priority over Website URL.' },
      { key: 'website', label: 'Website URL', required: false, helpText: 'Finds the newest Ad Pack for this website (e.g. `acme-hvac.com`).' },
    ],
    perform,
    sample: runSample,
    outputFields: runOutputFields,
  },
};
