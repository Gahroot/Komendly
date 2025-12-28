import { PrismaClient } from "@prisma/client";
import { dbLogger } from "@/lib/logger";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

// Create Prisma client with logging configuration
function createPrismaClient() {
  const client = new PrismaClient({
    log: [
      { emit: "event", level: "query" },
      { emit: "event", level: "error" },
      { emit: "event", level: "warn" },
    ],
  });

  // Log queries in development
  if (process.env.NODE_ENV !== "production") {
    client.$on("query", (e) => {
      dbLogger.debug(
        {
          query: e.query,
          params: e.params,
          duration: e.duration,
        },
        "Database query executed"
      );
    });
  }

  // Always log errors
  client.$on("error", (e) => {
    dbLogger.error({ message: e.message, target: e.target }, "Database error");
  });

  // Log warnings
  client.$on("warn", (e) => {
    dbLogger.warn({ message: e.message, target: e.target }, "Database warning");
  });

  dbLogger.info("Prisma client initialized");

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
