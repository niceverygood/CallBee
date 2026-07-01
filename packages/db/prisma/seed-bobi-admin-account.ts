/**
 * 기존 BoBi 테넌트(#1)에 tenant_admin 계정을 붙이는 시드 스크립트.
 * (신규 테넌트 생성 흐름과 별개 — BoBi 는 이미 존재하는 테넌트라 계정만 추가한다.)
 *
 * 실행: BOBI_ADMIN_EMAIL=... BOBI_ADMIN_PASSWORD=... \
 *   pnpm --filter @colli/db exec tsx prisma/seed-bobi-admin-account.ts
 */
import { randomBytes, scryptSync } from "node:crypto";
import { prisma } from "../src/index.js";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

async function main(): Promise<void> {
  const email = process.env.BOBI_ADMIN_EMAIL;
  const password = process.env.BOBI_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("BOBI_ADMIN_EMAIL / BOBI_ADMIN_PASSWORD env vars required");
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: "bobi" } });
  if (!tenant) throw new Error("bobi tenant not found — run seed-bobi-tenant.ts first");

  const account = await prisma.adminAccount.upsert({
    where: { email },
    update: { passwordHash: hashPassword(password), role: "tenant_admin", tenantId: tenant.id },
    create: {
      email,
      passwordHash: hashPassword(password),
      role: "tenant_admin",
      tenantId: tenant.id,
    },
  });
  // eslint-disable-next-line no-console
  console.log(`[seed-bobi-admin-account] done. accountId=${account.id} tenantId=${tenant.id}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error("[seed-bobi-admin-account] failed", err);
  await prisma.$disconnect();
  process.exit(1);
});
