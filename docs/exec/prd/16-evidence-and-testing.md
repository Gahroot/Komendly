# 16. Evidence and testing

Tests: `npx vitest run src/lib/exec/__tests__/exec.test.ts` covers the hold_and_measure rule, stage filter, authority classification, validator rejections, duplicates, review/learning, governance (fingerprint, overrides, audit chain), and the cycle (idempotency, dry run, pause, AI failure, step isolation) on an in-memory AdsEvent store.

Not verified: a live run against Postgres and a real Codex call; the reply-classification and competitive inputs are unwired. Nothing here promises a result: with no evidence the engine's output is 'keep operating and measure'.
