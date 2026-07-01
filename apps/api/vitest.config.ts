import { defineConfig } from "vitest/config";

// 단위 테스트는 NestJS 부트스트랩 없이 ToolsService(순수 클래스)를 직접 돌린다.
// 인프라(Postgres/Redis/Kakao) 없이 인메모리 목으로만 동작.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
