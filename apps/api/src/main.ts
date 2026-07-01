/**
 * NestJS 부트스트랩. Worker C 는 tool 엔드포인트만 노출한다.
 * DATA_ADAPTER=prisma 환경변수로 라이브 Postgres(Supabase) 어댑터로 스왑할 수
 * 있다(tenant.module.ts/tools.module.ts 참조). .env 는 dotenv/config 로 로드된다.
 * CI/유닛테스트는 이 파일을 실행하지 않는다(ToolsService 를 직접 인스턴스화).
 */
import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
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
