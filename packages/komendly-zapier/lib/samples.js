'use strict';

const { UPGRADE_URL } = require('./constants');

const LINK = 'https://komendly-ads.s3.amazonaws.com/ads/run_sample/ad-01-4x5.png?X-Amz-Expires=604800';

const adSample = {
  id: 'cmad0sample1',
  ad_id: 'cmad0sample1',
  run_id: 'cmrun0sample',
  website: 'https://acme-hvac.com',
  kind: 'static',
  status: 'ready',
  headline: 'AC out? Fixed today.',
  primary_text: 'Same-day AC repair in Austin. Upfront prices, no overtime fees. Book in 60 seconds.',
  cta: 'Book now',
  cta_type: 'BOOK_NOW',
  angle: 'No cooling on a 100° day',
  awareness: 'problem',
  landing_url: 'https://acme-hvac.com/book',
  image_url: LINK,
  video_url: null,
  image_urls: [LINK, LINK.replace('4x5', '1x1')],
  assets: [
    { asset_id: 'cmasset0feed', ratio: '4:5', mime: 'image/png', width: 1080, height: 1350, url: LINK, placements: ['feed'] },
    { asset_id: 'cmasset0square', ratio: '1:1', mime: 'image/png', width: 1080, height: 1080, url: LINK.replace('4x5', '1x1'), placements: ['feed'] },
  ],
  links_expire_at: '2026-11-28T10:05:00.000Z',
  view_url: 'https://www.komendly.com/ads/runs/cmrun0sample',
  upgrade_url: UPGRADE_URL,
  created_at: '2026-11-21T10:05:00.000Z',
};

const runSample = {
  id: 'cmrun0sample',
  run_id: 'cmrun0sample',
  website: 'https://acme-hvac.com',
  status: 'completed',
  done: true,
  is_trial: false,
  created_at: '2026-11-21T10:00:00.000Z',
  completed_at: '2026-11-21T10:05:00.000Z',
  ready_count: 3,
  total_count: 3,
  locked_count: 0,
  error: null,
  download_note: null,
  image_url: LINK,
  image_urls: adSample.image_urls,
  ads: [adSample],
  links_expire_at: '2026-11-28T10:05:00.000Z',
  view_url: 'https://www.komendly.com/ads/runs/cmrun0sample',
  upgrade_url: UPGRADE_URL,
};

const adOutputFields = [
  { key: 'id', label: 'Ad ID' },
  { key: 'run_id', label: 'Ad Pack ID' },
  { key: 'website', label: 'Website' },
  { key: 'headline', label: 'Headline' },
  { key: 'primary_text', label: 'Primary Text' },
  { key: 'cta', label: 'Call to Action' },
  { key: 'cta_type', label: 'Meta CTA Type' },
  { key: 'landing_url', label: 'Landing Page URL' },
  { key: 'image_url', label: 'Image URL (4:5 feed, link valid 7 days)' },
  { key: 'video_url', label: 'Video URL (animated ads)' },
  { key: 'image_urls[]', label: 'All Image URLs' },
  { key: 'links_expire_at', label: 'Links Expire At', type: 'datetime' },
  { key: 'view_url', label: 'View on Komendly' },
  { key: 'upgrade_url', label: 'Upgrade Link' },
  { key: 'created_at', label: 'Ready At', type: 'datetime' },
];

const runOutputFields = [
  { key: 'id', label: 'Ad Pack ID' },
  { key: 'website', label: 'Website' },
  { key: 'status', label: 'Status' },
  { key: 'done', label: 'Done', type: 'boolean' },
  { key: 'ready_count', label: 'Ads Ready', type: 'integer' },
  { key: 'total_count', label: 'Ads Total', type: 'integer' },
  { key: 'locked_count', label: 'Ads Locked (upgrade to unlock)', type: 'integer' },
  { key: 'image_url', label: 'First Image URL (link valid 7 days)' },
  { key: 'image_urls[]', label: 'All Image URLs' },
  { key: 'download_note', label: 'Download Note' },
  { key: 'view_url', label: 'View on Komendly' },
  { key: 'upgrade_url', label: 'Upgrade Link' },
  { key: 'created_at', label: 'Created At', type: 'datetime' },
];

module.exports = { adSample, runSample, adOutputFields, runOutputFields };
