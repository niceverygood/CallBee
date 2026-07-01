/**
 * 콜비 총괄관리자(platform_admin) 계정 시드 스크립트.
 *
 * 비밀번호 해시 포맷은 apps/api 의 인증 로직과 반드시 동일해야 한다:
 *   "scrypt:<saltHex>:<hashHex>" (scryptSync, 64바이트 해시)
 * apps/api/src/auth/password.ts 가 이 포맷으로 검증한다(Worker 브리핑에 명시).
 *
 * 실행: PLATFORM_ADMIN_EMAIL=... PLATFORM_ADMIN_PASSWORD=... \
 *   pnpm --filter @colli/db exec tsx prisma/seed-platform-admin.ts
 */
import { randomBytes, scryptSync } from "node:crypto";
import { prisma } from "../src/index.js";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

async function main(): Promise<void> {
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD env vars required");
  }

  const passwordHash = hashPassword(password);
  const account = await prisma.adminAccount.upsert({
    where: { email },
    update: { passwordHash, role: "platform_admin", tenantId: null },
    create: { email, passwordHash, role: "platform_admin", tenantId: null },
  });
  // eslint-disable-next-line no-console
  console.log(`[seed-platform-admin] done. accountId=${account.id} email=${account.email}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error("[seed-platform-admin] failed", err);
  await prisma.$disconnect();
  process.exit(1);
});
