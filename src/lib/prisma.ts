/**
 * @deprecated DO NOT import this file in API Routes or runtime code.
 * Prisma is used ONLY for migrations and schema generation (ADR-003 v2.1).
 * For runtime data access, use createSupabaseServerClient() from '@/lib/supabase-server'.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
