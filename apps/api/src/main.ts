/**
 * NestJS 부트스트랩. Worker C 는 tool 엔드포인트만 노출한다.
 * DATA_ADAPTER=prisma 환경변수로 라이브 Postgres(Supabase) 어댑터로 스왑할 수
 * 있다(tenant.module.ts/tools.module.ts 참조). .env 는 dotenv/config 로 로드된다.
 * CI/유닛테스트는 이 파일을 실행하지 않는다(ToolsService 를 직접 인스턴스화).
 */
import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { ADMIN_ACCOUNT_REPO } from "./tokens.js";
import type { AdminAccountRepository } from "./auth/auth.repository.js";
import { hashPassword } from "./auth/password.js";

/**
 * env 기반 총괄관리자 계정 시드(멱등). 콘솔 통합 후 platform_admin 로그인이
 * 유일한 관리자 진입 경로라, 특히 인메모리 모드(계정 저장소가 비어 시작)에서
 * 이 시드 없이는 승인 플로우를 돌릴 수 없다. 이미 있는 이메일이면 건너뛴다.
 * (라이브 Postgres 는 packages/db 의 seed-platform-admin.ts 로도 가능.)
 */
async function seedPlatformAdminFromEnv(app: INestApplication): Promise<void> {
  const email = process.env.DEV_PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.DEV_PLATFORM_ADMIN_PASSWORD;
  if (!email || !password) return;

  const accounts = app.get<AdminAccountRepository>(ADMIN_ACCOUNT_REPO);
  if (await accounts.findByEmail(email)) return;
  await accounts.create({
    email,
    passwordHash: hashPassword(password),
    role: "platform_admin",
    tenantId: null,
  });
  // eslint-disable-next-line no-console
  console.log(`[@colli/api] platform_admin seeded from env: ${email}`);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await seedPlatformAdminFromEnv(app);
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[@colli/api] tools endpoint listening on :${port}`);
}

// 직접 실행될 때만 부트스트랩(테스트 import 시 부작용 방지).
// ESM: import.meta.url 로 엔트리 여부 판별.
const isEntry =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`;

if (isEntry) {
  bootstrap().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[@colli/api] bootstrap failed", err);
    process.exit(1);
  });
}
