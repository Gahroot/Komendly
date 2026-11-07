// Probe how many parallel gpt-image-2 calls the codex images endpoint tolerates.
// Usage: CODEX_AUTH_FILE=... npx tsx scripts/image-concurrency-probe.ts 6
import { CodexAuth } from "../src/providers/codex-auth";
import { codexImage } from "../src/providers/codex-images";

const n = Number(process.argv[2] ?? 4);
const auth = CodexAuth.fromEnv(process.env);
const { accessToken, accountId } = await auth.resolve();
const t0 = Date.now();
const res = await Promise.allSettled(Array.from({ length: n }, async (_, i) => {
  const s = Date.now();
  await codexImage({ prompt: `A plain flat ${["red", "blue", "green", "orange", "grey", "teal"][i % 6]} square, nothing else.`, size: "1024x1024", quality: "low", background: "opaque", token: accessToken, accountId });
  return Date.now() - s;
}));
for (const r of res) console.log(r.status === "fulfilled" ? `ok ${r.value}ms` : `fail ${String(r.reason).slice(0, 160)}`);
console.log(`n=${n} wall ${Date.now() - t0}ms`);
