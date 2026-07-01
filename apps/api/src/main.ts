/**
 * NestJS 부트스트랩. Worker C 는 tool 엔드포인트만 노출한다.
 * 주의: 여기서 실인프라(Postgres/Redis/Kakao) 포트 배선은 하지 않는다
 * (통합 시 Orchestrator/Worker A 가 ToolsModule 토큰을 override).
 * CI/유닛테스트는 이 파일을 실행하지 않는다(ToolsService 를 직접 인스턴스화).
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
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
