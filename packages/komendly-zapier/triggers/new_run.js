'use strict';

const { url, getRun, runFromSummary } = require('../lib/http');
const { runSample, runOutputFields } = require('../lib/samples');

// Polling. A new pack shows up newest first, so only the top few are loaded in full (status + image links); the rest
// were seen on earlier polls and stay summaries.
const DETAILED = 5;

const perform = async (z) => {
  const { runs } = (await z.request({ url: url('/api/ads/runs') })).data;
  const list = runs || [];
  const detailed = await Promise.all(list.slice(0, DETAILED).map((r) => getRun(z, r.id).catch(() => runFromSummary(r))));
  return [...detailed, ...list.slice(DETAILED).map(runFromSummary)];
};

module.exports = {
  key: 'new_run',
  noun: 'Ad Pack',
  display: {
    label: 'New Ad Pack',
    description: 'Triggers when a new Ad Pack is started (from Komendly, Zapier, an AI agent or Ozzy Autopilot).',
  },
  operation: {
    type: 'polling',
    perform,
    sample: runSample,
    outputFields: runOutputFields,
  },
};
