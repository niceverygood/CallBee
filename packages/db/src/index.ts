/**
 * @colli/db — Prisma 클라이언트 싱글턴 + 타입 재노출.
 * 실제 클라이언트는 `prisma generate` 후 @prisma/client 에서 생성된다.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
export { PrismaClient };
