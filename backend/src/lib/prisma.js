import path from "node:path";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  const localFile = path.resolve(process.cwd(), "backend/prisma/dev.db");
  process.env.DATABASE_URL = `file:${localFile}`;
}

export const prisma = new PrismaClient();
