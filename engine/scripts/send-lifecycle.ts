// Ops: send a one-off lifecycle email.
//   cd engine && set -a; . ../.env.local; set +a
//   npx tsx scripts/send-lifecycle.ts --user someone@example.com --kind refreshed_pack --run <runId> [--dry-run]
// Ignores the lifecycle_email flag (explicit ops action) but still never emails paid / unsubscribed / e2e users.
import { createDb } from "../src/db";
import { createProvider } from "../src/providers/index";
import { createSmtpSender, smtpConfigured } from "../src/lifecycle/mail";
import { sendRefreshedPack } from "../src/lifecycle/send";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const email = arg("user");
  const kind = arg("kind");
  const runId = arg("run");
  const dryRun = process.argv.includes("--dry-run") || process.env.LIFECYCLE_DRY_RUN === "1";
  if (!email || kind !== "refreshed_pack" || !runId) {
    console.error("usage: send-lifecycle.ts --user <email> --kind refreshed_pack --run <runId> [--dry-run]");
    process.exit(2);
  }
  if (!process.env.LIFECYCLE_EMAIL_SECRET) throw new Error("LIFECYCLE_EMAIL_SECRET is required");
  if (!dryRun && !smtpConfigured()) throw new Error("SMTP_* not configured (use --dry-run)");
  const db = createDb();
  const provider = (() => {
    try {
      return createProvider(process.env.AI_PROVIDER === "openai" ? "openai" : "codex");
    } catch {
      return null;
    }
  })();
  const result = await sendRefreshedPack({ db, provider, send: createSmtpSender() }, email, runId, dryRun);
  console.log(JSON.stringify(result, null, 2));
  await db.$disconnect();
  if ("error" in result || result.status === "failed") process.exit(1);
}

void main();
