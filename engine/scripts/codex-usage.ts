// Print ChatGPT plan usage windows for the Codex login (no tokens/emails printed).
// Usage: CODEX_AUTH_FILE=~/.ezcoder/auth.json npx tsx scripts/codex-usage.ts
import { CodexAuth } from "../src/providers/codex-auth";

const { accessToken, accountId } = await CodexAuth.fromEnv(process.env).resolve();
const claims = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, { chatgpt_plan_type?: string } | undefined>;
const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
  headers: { authorization: `Bearer ${accessToken}`, ...(accountId ? { "chatgpt-account-id": accountId } : {}), "user-agent": "codex_cli_rs" },
  signal: AbortSignal.timeout(15_000),
});
const body = (await res.json()) as Record<string, unknown>;
for (const k of ["email", "user_id", "account_id"]) delete body[k];
console.log(JSON.stringify({ status: res.status, jwtPlan: claims["https://api.openai.com/auth"]?.chatgpt_plan_type ?? null, body }, null, 2));
