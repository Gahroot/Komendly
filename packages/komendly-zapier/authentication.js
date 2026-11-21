'use strict';

const { url } = require('./lib/http');
const { KEY_URL, SIGNUP_URL } = require('./lib/constants');

// API-key auth: Komendly's OAuth server only issues tokens for its hosted MCP endpoint (/api/mcp); the REST API
// endpoints Zapier calls accept personal `kmd_` keys.
module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'api_key',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText: `Your Komendly API key (starts with \`kmd_\`). [Get your key](${KEY_URL}). No account yet? [Start free: your first 3 ads are on us](${SIGNUP_URL}).`,
    },
  ],
  test: async (z) => (await z.request({ url: url('/api/ads/me') })).data,
  connectionLabel: '{{email}}',
};
