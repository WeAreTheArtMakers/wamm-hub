import path from "node:path";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith("file:")) {
  process.env.DATABASE_URL = `file:${path.resolve(process.cwd(), "backend/prisma/dev.db")}`;
}

export const prisma = new PrismaClient();
