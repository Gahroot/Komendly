# Live-config actions (Hormozi funnel)

1. Deploy web (commit the 9 content/blog edits + 2 new tests) so served blog/llms.txt drop the "one-click publish" claims: `git add content/blog src/lib/__tests__/public-copy-lint-wide.test.ts src/lib/ads/__tests__/checkout-route-hormozi.test.ts && git commit` then push (Vercel auto-deploys).
2. Cold-email arms: recheck in 2-3 days: `psql "$KLY_DB" -c "select a.key,count(*) from \"OutboundSend\" s join \"KlyArm\" a on a.id=any(s.\"armIds\") where s.\"sentAt\">now()-interval '3 days' and a.key like 'hz-%' group by 1"`. If hz-which-job/hz-gift-outcome stay at 0, check kly arm selection.
3. Decide on the legacy 50/50 `home_hero` experiment (src/lib/analytics/experiments.ts, active: true); it assigns "companion" to half of visitors regardless of sys_offer_intel. Set `active: false` there if the dream headline must be the only variant.
4. Reels: sys_reels is OFF but reels were published 26 Nov; confirm the intended path. Enable: `UPDATE "AdsFeatureFlag" SET enabled=true WHERE key='sys_reels'` (only if wanted).
5. Meta paid ads: brief says OFF; MEMORY shows a live $30/day campaign. Pause with the Meta Ads CLI/dashboard if truly intended.
6. Fix other workers' failures before release: registry.json flag key kly_partner_segments, email-guard sender classification, control cron inventory (/api/cron/newsletter), funnel classifyTouch for sys_newsletter, strategic-cycle.ts typing.
