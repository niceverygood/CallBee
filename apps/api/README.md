# @colli/api — Worker C — Backend / Data / Tools

8개 tool 구현(NestJS 엔드포인트 `POST /tools/:name`) + BoBi read 어댑터 + KB/티켓/콜백/세션/알림 포트.
공유 타입/스키마는 오직 `@colli/contracts` 에서 import. 상태 변경은 전부 tool 경유(GUARDRAIL #2).

## 구조
- `tools.service.ts` — `ToolsService`(프레임워크 독립 순수 클래스). 8개 tool 메서드 + `invoke(name, params, ctx)` 디스패치.
- `ports.ts` — 어댑터 경계: `BoBiReadPort` / `NotificationsPort` / `TicketRepository` / `KnowledgeRepository` / `CallbackRepository` / `SessionStore` / `TracePort`.
- `adapters/in-memory.ts` — 인프라 없이 도는 인메모리 구현(테스트/데모 기본값).
- `adapters/prisma.ts` — `@colli/db` Prisma 실구현(티켓/KB/콜백/trace). 통합 시 토큰 override 로 스왑.
- `tools.controller.ts` / `tools.module.ts` / `app.module.ts` / `main.ts` — 얇은 NestJS 배선(`ToolInvocationResult` 봉투).
- `tokens.ts` — DI 토큰(포트 바인딩).

## 검증
```
pnpm --filter @colli/api typecheck
pnpm --filter @colli/api test
```
단위 테스트는 NestJS 부트스트랩 없이 `ToolsService` 를 직접 인스턴스화하고 인메모리 목을 주입한다.

## 통합 노트
- `main.ts` 는 실인프라(Postgres/Redis/Kakao) 배선을 하지 않는다. 통합 시 Orchestrator/Worker A 가
  `ToolsModule` 토큰(`BOBI_READ` 등)을 Prisma/Redis/Worker D 구현으로 override 한다.
- Worker A 는 통화 세션 식별자를 `x-call-session-id` 헤더로 전달 → trace/세션 상태에 연결된다.
