/**
 * 루트 애플리케이션 모듈. Worker C 는 ToolsModule + TenantModule(v2 멀티테넌트
 * 확장) + AuthModule(v3 로그인 계정)을 얹는다. 대화 정책(B)·세션 배선(A)·
 * 알림 발송 로직(D)·프론트(E)는 범위 밖.
 *
 * 주의: ToolsController 는 CustomToolExecutor 를 optional 로 주입받는다
 * (tools.controller.test.ts 4개가 단일 인자로 직접 인스턴스화하는 하위호환
 * 유지). NestJS DI 로 부트스트랩되는 이 경로에서는 TenantModule 이 노출하는
 * CustomToolExecutor 가 정상적으로 주입된다.
 */
import { Module } from "@nestjs/common";
import { ToolsModule } from "./tools.module.js";
import { TenantModule } from "./tenant.module.js";
import { AuthModule } from "./auth.module.js";

@Module({
  imports: [ToolsModule, TenantModule, AuthModule],
})
export class AppModule {}
