/**
 * 루트 애플리케이션 모듈. Worker C 는 ToolsModule 만 얹는다.
 * 대화 정책(B)·세션 배선(A)·알림 발송 로직(D)·프론트(E)는 범위 밖.
 */
import { Module } from "@nestjs/common";
import { ToolsModule } from "./tools.module.js";

@Module({
  imports: [ToolsModule],
})
export class AppModule {}
