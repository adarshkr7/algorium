import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

function setupDatabaseUrl(): string {
  if (process.env.DATABASE_URL && !process.env.VERCEL) {
    return process.env.DATABASE_URL;
  }

  // On Vercel serverless environment:
  // Root filesystem is read-only. We copy seed prisma/dev.db to /tmp/dev.db
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    const tmpDbPath = "/tmp/dev.db";
    try {
      if (!fs.existsSync(tmpDbPath)) {
        const seedPath = path.join(/*turbopackIgnore: true*/ process.cwd(), "prisma", "dev.db");
        if (fs.existsSync(seedPath)) {
          fs.copyFileSync(seedPath, tmpDbPath);
        }
      }
    } catch (e) {
      console.error("Error setting up serverless SQLite db in /tmp:", e);
    }
    return `file:${tmpDbPath}`;
  }

  return process.env.DATABASE_URL || "file:./prisma/dev.db";
}

const dbUrl = setupDatabaseUrl();
process.env.DATABASE_URL = dbUrl;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
