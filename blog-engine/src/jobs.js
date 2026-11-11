// Job table. Schedules are America/New_York; days 0=Sun..6=Sat. Codex jobs sit in the night window (23:00-08:00 NY).
import * as research from './jobs/research.js';
import * as draft from './jobs/draft.js';
import * as gate from './jobs/gate.js';
import * as monitor from './jobs/monitor.js';
import * as aiVisibility from './jobs/aiVisibility.js';
import * as optimize from './jobs/optimize.js';
import * as report from './jobs/report.js';
import * as audit from './jobs/audit.js';
import { keepalive, KEEPALIVE_SCHEDULE } from './codex.js';

export const JOBS = {
  monitor: { schedule: { hour: 6 }, run: monitor.run },                    // daily: GSC + Bing + sitemap (no Codex)
  research: { schedule: { hour: 0, days: [0] }, run: research.run },       // Sun 0:00
  draft: { schedule: { hours: [1, 3] }, run: draft.run },                  // daily, 1 draft per run (DRAFTS_PER_DAY=2)
  gate: { schedule: { hourly: true }, run: gate.run },                     // hourly; fact-check step defers outside the night window
  optimize: { schedule: { hour: 2, days: [5] }, run: optimize.run },       // Fri 2:00
  audit: { schedule: { hour: 4, days: [6] }, run: audit.run },             // Sat 4:00
  ai_visibility: { schedule: { hour: 5, days: [3] }, run: aiVisibility.run }, // Wed 5:00, even ISO weeks
  codex_keepalive: { schedule: KEEPALIVE_SCHEDULE, run: keepalive },       // Sat 5:00
  report: { schedule: { hour: 8, days: [1] }, run: report.run }            // Mon 8:00 (no Codex)
};
export const alert = report.alert;
