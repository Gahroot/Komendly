'use strict';

const authentication = require('./authentication');
const { addApiKey, handleErrors } = require('./lib/http');
const generateAds = require('./creates/generate_ads');
const findRun = require('./searches/find_run');
const adsReady = require('./triggers/ads_ready');
const newRun = require('./triggers/new_run');

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,
  flags: { cleanInputData: false },
  authentication,
  beforeRequest: [addApiKey],
  afterResponse: [handleErrors],
  triggers: { [adsReady.key]: adsReady, [newRun.key]: newRun },
  searches: { [findRun.key]: findRun },
  creates: { [generateAds.key]: generateAds },
};
