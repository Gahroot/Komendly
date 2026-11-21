'use strict';

// KOMENDLY_BASE_URL is only for local/staging testing; the published app always talks to production.
const BASE_URL = (process.env.KOMENDLY_BASE_URL || 'https://www.komendly.com').replace(/\/+$/, '');
const SITE = 'https://www.komendly.com';
// Attribution: growth system `zapier` (src/lib/growth/systems.ts) = first touch with utm_source=zapier.
const UPGRADE_URL = `${SITE}/pricing?utm_source=zapier&utm_medium=integration`;
const KEY_URL = `${SITE}/dashboard/api?utm_source=zapier&utm_medium=integration`;
const SIGNUP_URL = `${SITE}/ads/signup?utm_source=zapier&utm_medium=integration`;
const VERSION = require('../package.json').version;

module.exports = { BASE_URL, SITE, UPGRADE_URL, KEY_URL, SIGNUP_URL, VERSION };
