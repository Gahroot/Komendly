// Import/refresh Maildoso mailboxes into the Kly mailbox store (idempotent).
//   set -a; . ../.env.local; set +a; npx tsx scripts/maildoso-sync.ts
import { createDb } from "../src/db";
import { syncMaildoso } from "../src/maildoso";

const token = process.env.MAILDOSO_API_TOKEN;
if (!token) throw new Error("MAILDOSO_API_TOKEN is not set");
const db = createDb();
try {
  console.log(await syncMaildoso(db, { token, tokenKey: process.env.ADS_TOKEN_KEY, now: new Date() }));
} finally {
  await db.$disconnect();
}
