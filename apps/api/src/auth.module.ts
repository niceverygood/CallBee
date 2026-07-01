/**
 * AuthModule — AdminAccount 로그인/계정발급을 조립하는 얇은 NestJS 모듈
 * (ToolsModule/TenantModule 과 동일 패턴).
 *
 * 기본 바인딩은 인메모리 어댑터(데모/로컬). `DATA_ADAPTER=prisma` 환경변수가
 * 설정되면 Prisma(@colli/db, AdminAccount 모델) 어댑터로 스왑한다.
 *
 * TenantModule 을 import 해 TENANT_REPO/TENANT_AGENT_CONFIG_REPO 를 재사용한다
 * (POST /admin/tenants 가 테넌트+에이전트설정+계정을 한 트랜잭션으로 생성).
 */
import { Module, type Provider } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { TenantModule } from "./tenant.module.js";
import { ADMIN_ACCOUNT_REPO } from "./tokens.js";
import {
  InMemoryAdminAccountRepository,
  PrismaAdminAccountRepository,
} from "./auth/auth.repository.js";

const inMemoryPortProviders: Provider[] = [
  { provide: ADMIN_ACCOUNT_REPO, useClass: InMemoryAdminAccountRepository },
];

const prismaPortProviders: Provider[] = [
  { provide: ADMIN_ACCOUNT_REPO, useClass: PrismaAdminAccountRepository },
];

const defaultPortProviders: Provider[] =
  process.env.DATA_ADAPTER === "prisma" ? prismaPortProviders : inMemoryPortProviders;

@Module({
  imports: [TenantModule],
  controllers: [AuthController],
  providers: [...defaultPortProviders],
})
export class AuthModule {}
