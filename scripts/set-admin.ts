// Dev helper for local design QA: give an existing dev user a paid plan, optionally admin.
// Usage: npx tsx --env-file=.env.local scripts/set-admin.ts <email> [--admin]
import { PrismaClient } from "@prisma/client";

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: set-admin.ts <email>");
  const prisma = new PrismaClient();
  const user = await prisma.user.update({ where: { email }, data: { plan: "pro", subscriptionStatus: "active", isAdmin: process.argv.includes("--admin") } });
  console.log(`${user.email} plan=${user.plan} isAdmin=${user.isAdmin}`);
  await prisma.$disconnect();
}

void main();
