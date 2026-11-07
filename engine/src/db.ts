import { PrismaClient } from "@prisma/client";

export type Db = PrismaClient;

export function createDb(): PrismaClient {
  return new PrismaClient({ log: ["warn", "error"] });
}
