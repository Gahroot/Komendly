'use strict';

const { url, hostOf } = require('../lib/http');
const { adSample, adOutputFields } = require('../lib/samples');

// Polling (Komendly has no webhooks). Newest ready ads first; Zapier dedupes by `id` (the ad id), so each ad fires once.
const perform = async (z, bundle) => {
  const runId = String(bundle.inputData.run_id || '').trim();
  const { ads } = (await z.request({ url: url('/api/zapier/ads'), params: { limit: 50, ...(runId ? { run_id: runId } : {}) } })).data;
  const host = hostOf(bundle.inputData.website);
  return (ads || []).filter((a) => !host || hostOf(a.website) === host);
};

module.exports = {
  key: 'ads_ready',
  noun: 'Ad',
  display: {
    label: 'Ads Ready',
    description: 'Triggers when a new ad is ready, with its image link, headline, primary text and call to action.',
  },
  operation: {
    type: 'polling',
    inputFields: [
      { key: 'website', label: 'Website URL', required: false, helpText: 'Only ads for this website. Leave empty for all.' },
      { key: 'run_id', label: 'Ad Pack ID', required: false, dynamic: 'new_run.id.website', helpText: 'Only ads from this Ad Pack. Leave empty for all.' },
    ],
    perform,
    sample: adSample,
    outputFields: adOutputFields,
  },
};
