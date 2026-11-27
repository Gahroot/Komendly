# AI policy: Codex subscription only

All Komendly AI **text** runs on the owner's Codex (ChatGPT) subscription. No pay-per-token API key is used for growth, ops, revenue or product-intelligence features.

## Where each AI call runs
| Caller | Runs on | How |
|---|---|---|
| engine jobs, Studio turns, EZ Motion agent | Codex login (`CodexCredential` row) | `createProvider('codex')`, `engine/src/providers/*`. No `OPENAI_API_KEY` fallback: no login = the job fails closed. |
| kly | Codex login (same row) | same provider |
| Web (Vercel): inbound auto-responder, review gate, creative hubs | Codex via the **AI gateway** | `webText` -> `gatewayText` (`src/lib/ai-gateway/client.ts`) |

`TEXT_BRAIN=codex` bypasses MiMo. The gateway always forces Codex.

## AI gateway over Postgres
Web, engine and kly never talk over HTTP. The web client writes AdsEvent `ai_request` {id, system, prompt, schema, model:null, purpose, requester} and polls (250-500 ms) for AdsEvent `ai_result` {id, ok, text, json, error, ms, costMicros, tokens}. The engine loop `engine/src/aigateway/loop.ts` (every 2 s) claims each request once (`ai_claim` under an advisory transaction lock), ignores requests older than 5 min, runs it on Codex, writes the result.
- **Fail closed:** flag off, no answer in the timeout (default 45 s; `webText` 40 s), a cap/guard hit or an error all throw `GatewayError`. Auto-reply sends nothing (the reply is still stored and forwarded); the review gate rejects the item.
- **Flag:** `sys_ai_gateway` (AdsFeatureFlag, default OFF). While OFF the web client throws immediately.
- **Caps:** `AI_GATEWAY_MAX_PER_HOUR` (default 120). **Weekly-limit guard:** pauses when Kly's seen Codex weekly usage >= `AI_GATEWAY_PAUSE_PCT` (default 97).
- Do not add a second Codex token refresher in web: refresh tokens rotate and the engine refreshes under an advisory lock.

## Exceptions
- **OpenAI TTS** (`src/lib/fal-lipsync/tts-generator.ts`, testimonials product): Codex cannot produce speech audio. Stays on the API key.
- Testimonials product text (`src/lib/openai-script.ts`, `src/app/api/mirage/generate/route.ts`): out of scope of this migration, still on `OPENAI_API_KEY`. Move them to the gateway when the product is touched.
These are allow-listed in `src/lib/__tests__/no-api-key-ai.test.ts`.

## Adding a new AI call
1. In the engine: `createProvider('codex', ...)` / the `structured()` helper. Never read `OPENAI_API_KEY`.
2. In web code: use `gatewayText(req, { purpose, requester })` (or `webText`) and handle the thrown error by doing nothing risky (fail closed).
3. Keep it out of the key-reading guard: `npx vitest run src/lib/__tests__/no-api-key-ai.test.ts`.
