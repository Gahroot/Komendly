# Activation checklist, opportunities 31-60 (coordinator runs; the audit wrote nothing to prod)

Use `U=$(cat /tmp/.kdb)`; never print it. Flags live in `AdsFeatureFlag` with key `sys_<system>`.

1. Founder alert inbox (needed for hand-fulfilled intake: makeover, rescue, launch, nonprofit, review, take-down). Check `vercel env ls production | grep ADS_ALERT_EMAIL` (MEMORY says it is set). Without it intake is silently stored.
2. Public makeovers, showcase, business of the day (#32, #33): only after you are ready to review each item.
   `psql "$U" -c "INSERT INTO \"AdsFeatureFlag\"(key,enabled,\"updatedAt\") VALUES ('sys_creative_publish',true,now()) ON CONFLICT (key) DO UPDATE SET enabled=true"` (confirm column names with `\d "AdsFeatureFlag"` first).
3. Nominee email (#37): `LIFECYCLE_EMAIL_SECRET` must be set (`vercel env ls production`), then the same insert for `sys_creative_outreach`. It sends one opt-out-able email per nominated public address.
4. Giveaway (#36): choose a real prize, then `vercel env add GIVEAWAY_PRIZE production` and redeploy. Leave unset to keep it closed.
5. Review gifts (#40): dry-run `kly/src/review-gifts.ts` first; then insert the flag `sys_review_gifts` = true (currently false).
6. New-business gifts (#39): flag is ON but prod has 0 `system_*` events for it. Check Kly logs: `railway logs --service kly | grep new_business`. If the tick never runs, redeploy kly from a clean worktree.
7. Competitor ad watch (#52): flag ON, 0 subscribers. Subscribe a test address from /tools/competitor-ad-watch yourself, confirm it, and check that the Monday send (13:00 UTC) records `ad_watch_sent`.
8. After deploy, request re-indexing: IndexNow already covers sitemap URLs (`sys_indexnow` ON). New sitemap entries: /tools/competitor-ad-watch, /seasonal, /seasonal/<season>.
