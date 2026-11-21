'use strict';

const { url, getRun } = require('../lib/http');
const { runSample, runOutputFields } = require('../lib/samples');

const GOALS = { auto: 'Let Ozzy pick', leads: 'Get leads / calls', sales: 'Sales', traffic: 'Website visits', awareness: 'Awareness' };

const perform = async (z, bundle) => {
  const input = bundle.inputData;
  const offer = String(input.offer || '').trim().slice(0, 240);
  const body = {
    url: String(input.website || '').trim(),
    ...(input.goal ? { goal: input.goal } : {}),
    ...(input.animated === true || input.animated === 'true' ? { motion: true } : {}),
    // The offer steers the pack like a hook the owner picked from their hook library.
    ...(offer ? { seed: { angle: offer, hook: offer, origin: 'hook_library' } } : {}),
  };
  const started = (await z.request({ url: url('/api/ads/runs'), method: 'POST', body })).data;
  const run = await getRun(z, started.runId);
  return { ...run, resumed: Boolean(started.resumed) };
};

module.exports = {
  key: 'generate_ads',
  noun: 'Ad Pack',
  display: {
    label: 'Generate Ads From a Website',
    description: 'Reads a business website and makes a pack of ready-to-run Meta (Facebook/Instagram) ads. Ads are ready in a few minutes: use the "Ads Ready" trigger or "Find Ad Pack" to get the images.',
  },
  operation: {
    inputFields: [
      { key: 'website', label: 'Website URL', required: true, helpText: 'The business website Ozzy reads, e.g. `https://acme-hvac.com`.' },
      { key: 'goal', label: 'Goal', required: false, choices: GOALS, helpText: 'What the ads should drive. Leave empty to let Ozzy pick from the website.' },
      { key: 'offer', label: 'Offer', required: false, type: 'text', helpText: 'Optional offer or hook to build the ads around, e.g. `$49 AC tune-up this week only` (max 240 characters).' },
      { key: 'animated', label: 'Add an Animated Ad', required: false, type: 'boolean', default: 'false', helpText: 'Also make an animated ad (paid plans).' },
    ],
    perform,
    sample: { ...runSample, status: 'extracting', done: false, ready_count: 0, image_url: null, image_urls: [], ads: [], resumed: false },
    outputFields: [...runOutputFields, { key: 'resumed', label: 'Resumed Existing Pack', type: 'boolean' }],
  },
};
