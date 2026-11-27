// Privacy purge: list (default) or anonymise (--apply) everything referencing one user. NEVER run against production without a backup:
//   pg_dump "$POSTGRES_URL_NON_POOLING" -Fc -f pre-purge-$(date +%F).dump     (and keep it only as long as the retention policy allows)
// Usage: set -a; . ./.env.local; set +a
//   npx tsx scripts/privacy-purge-user.ts --email someone@example.com                 # dry run: counts per table
//   npx tsx scripts/privacy-purge-user.ts --email someone@example.com --apply         # execute (asks for --confirm <email>)
//   add --delete-content to also delete the user's testimonial videos/reviews. Financial records are retained.
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { buildPurgePlan, EVENT_PII_KEYS, RETAINED, type PurgeStep } from "../src/lib/ops/security/privacy-purge";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
const flag = (n: string) => process.argv.includes(`--${n}`);

type Delegate = { count(a: { where: object }): Promise<number>; deleteMany(a: { where: object }): Promise<{ count: number }>; updateMany(a: { where: object; data: object }): Promise<{ count: number }> };

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  if (!email) throw new Error("--email is required");
  const apply = flag("apply");
  if (apply && arg("confirm")?.toLowerCase() !== email) throw new Error("--apply needs --confirm <the same email>");
  const db = new PrismaClient();
  try {
    const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true } });
    if (!user) throw new Error("no user with that email");
    const ws = await db.adsWorkspaceMember.findMany({ where: { userId: user.id }, select: { workspaceId: true } });
    const plan = buildPurgePlan({ userId: user.id, email, workspaceIds: ws.map((w) => w.workspaceId) });
    console.log(apply ? "APPLYING purge" : "DRY RUN (no changes). Add --apply --confirm <email> to execute.");
    console.log(`Retained (not touched): ${RETAINED.join(", ")}\n`);
    for (const step of plan) {
      const skipped = step.optIn && !flag(step.optIn);
      const n = await count(db, step);
      console.log(`${skipped ? "SKIP " : "     "}${step.action.padEnd(12)} ${step.model.padEnd(24)} rows=${n}  ${step.note}${skipped ? "  (needs --" + step.optIn + ")" : ""}`);
      if (apply && !skipped && (n > 0 || step.action === "suppress")) await run(db, step, user.id);
    }
  } finally {
    await db.$disconnect();
  }
}

const delegate = (db: PrismaClient, model: string) => (db as unknown as Record<string, Delegate>)[model.charAt(0).toLowerCase() + model.slice(1)]!;

async function count(db: PrismaClient, s: PurgeStep): Promise<number> {
  if (s.action === "suppress") return (await db.outboundSuppression.count({ where: { value: String(s.where.value) } })) ? 0 : 1;
  if (s.model === "AdsEvent" && "propsContainsEmail" in s.where) {
    const r = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "AdsEvent" WHERE lower(props::text) LIKE ${"%" + String(s.where.propsContainsEmail).toLowerCase() + "%"}`;
    return Number(r[0]?.n ?? 0);
  }
  return delegate(db, s.model).count({ where: s.where });
}

async function run(db: PrismaClient, s: PurgeStep, userId: string) {
  if (s.action === "delete") await delegate(db, s.model).deleteMany({ where: s.where });
  else if (s.action === "anonymise") {
    const data = s.id === "user" ? { ...s.set, passwordHash: randomBytes(32).toString("hex") } : s.set!;
    await delegate(db, s.model).updateMany({ where: s.where, data });
  } else if (s.action === "suppress") await db.outboundSuppression.upsert({ where: { value: String(s.where.value) }, create: { value: String(s.where.value), kind: "email", reason: "manual" }, update: {} });
  else if (s.action === "scrub_events") {
    const keys = EVENT_PII_KEYS.map((k) => `- '${k}'`).join(" ");
    if ("propsContainsEmail" in s.where) await db.$executeRawUnsafe(`UPDATE "AdsEvent" SET props = props ${keys} WHERE lower(props::text) LIKE $1`, "%" + String(s.where.propsContainsEmail).toLowerCase() + "%");
    else await db.$executeRawUnsafe(`UPDATE "AdsEvent" SET props = props ${keys} WHERE "userId" = $1`, userId);
  }
}
main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
