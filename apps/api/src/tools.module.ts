/**
 * ToolsModule — ToolsService + 포트 바인딩을 조립하는 얇은 NestJS 모듈.
 *
 * 기본 바인딩은 인메모리 어댑터(데모/로컬). `DATA_ADAPTER=prisma` 환경변수가
 * 설정되면 Prisma 어댑터가 있는 포트(TICKET_REPO/KNOWLEDGE_REPO/CALLBACK_REPO/
 * TRACE_PORT)만 라이브 Postgres 로 스왑한다. BOBI_READ/NOTIFICATIONS/
 * SESSION_STORE 는 이 저장소들의 Prisma/Redis 구현이 아직 없어(범위 밖)
 * DATA_ADAPTER 값과 무관하게 항상 인메모리를 유지한다.
 *
 * Prisma 티켓/KB/콜백/trace 리포지토리는 생성자에서 tenantId 를 받는 "테넌트
 * 스코프 인스턴스"다(adapters/prisma.ts). 이 모듈은 요청 스코프 DI 가 아직
 * 없어 process.env.DEFAULT_TENANT_ID(없으면 빈 문자열)로 고정 스코프
 * 바인딩한다 — 단일 프로세스=단일 테넌트를 가정한 임시 배선이며, 진짜
 * 멀티테넌트 요청 스코프 배선은 통합 단계에서 결정한다(prisma.ts 상단 주석과
 * 동일 전제). TenantsController 의 KB 라우트는 이 한계를 피하려고 경로의
 * :id 로 직접 PrismaKnowledgeRepository 를 생성한다(tenants.controller.ts).
 *
 * main.ts 는 이 모듈만 부트스트랩한다(포트 실배선은 하지 않음).
 *
 * v2(멀티테넌트) 확장: ToolsController 가 CustomToolExecutor(TenantModule 소유)를
 * 선택적으로 주입받아 name ∉ SYSTEM_TOOL_NAMES 인 tool 호출을 위임한다
 * (tools.controller.ts 참조). TenantModule 을 import 해 NestJS DI 로 실제
 * CustomToolExecutor 인스턴스를 연결한다.
 *
 * 주의: 기존 유닛테스트(harness.ts 등)는 NestJS DI 를 전혀 거치지 않고
 * InMemory* 클래스를 직접 new 해서 ToolsService 를 조립하므로, 이 모듈의
 * provider 배열 변경은 테스트 결과에 영향을 주지 않는다.
 */
import { Module, type Provider } from "@nestjs/common";
import { ToolsController } from "./tools.controller.js";
import { ToolsService, type ToolsDeps } from "./tools.service.js";
import { TenantModule } from "./tenant.module.js";
import type { TenantId } from "@colli/contracts";
import {
  BOBI_READ,
  NOTIFICATIONS,
  TICKET_REPO,
  KNOWLEDGE_REPO,
  CALLBACK_REPO,
  SESSION_STORE,
  TRACE_PORT,
} from "./tokens.js";
import {
  InMemoryBoBiRead,
  InMemoryNotifications,
  InMemoryTicketRepository,
  InMemoryKnowledgeRepository,
  InMemoryCallbackRepository,
  InMemorySessionStore,
  InMemoryTrace,
} from "./adapters/in-memory.js";
import {
  PrismaTicketRepository,
  PrismaKnowledgeRepository,
  PrismaCallbackRepository,
  PrismaTrace,
} from "./adapters/prisma.js";
import type {
  BoBiReadPort,
  NotificationsPort,
  TicketRepository,
  KnowledgeRepository,
  CallbackRepository,
  SessionStore,
  TracePort,
} from "./ports.js";

// 인메모리(기본) 포트 프로바이더.
const inMemoryPortProviders: Provider[] = [
  { provide: BOBI_READ, useClass: InMemoryBoBiRead },
  { provide: NOTIFICATIONS, useClass: InMemoryNotifications },
  { provide: TICKET_REPO, useClass: InMemoryTicketRepository },
  { provide: KNOWLEDGE_REPO, useClass: InMemoryKnowledgeRepository },
  { provide: CALLBACK_REPO, useClass: InMemoryCallbackRepository },
  { provide: SESSION_STORE, useClass: InMemorySessionStore },
  { provide: TRACE_PORT, useClass: InMemoryTrace },
];

// Prisma(라이브 Postgres) 포트 프로바이더. DATA_ADAPTER=prisma 일 때만 사용.
const defaultTenantId = () => (process.env.DEFAULT_TENANT_ID ?? "") as TenantId;
const prismaPortProviders: Provider[] = [
  // BOBI_READ/NOTIFICATIONS/SESSION_STORE 는 Prisma/Redis 구현이 없어 인메모리 유지.
  { provide: BOBI_READ, useClass: InMemoryBoBiRead },
  { provide: NOTIFICATIONS, useClass: InMemoryNotifications },
  { provide: TICKET_REPO, useFactory: () => new PrismaTicketRepository(defaultTenantId()) },
  {
    provide: KNOWLEDGE_REPO,
    useFactory: () => new PrismaKnowledgeRepository(defaultTenantId()),
  },
  {
    provide: CALLBACK_REPO,
    useFactory: () => new PrismaCallbackRepository(defaultTenantId()),
  },
  { provide: SESSION_STORE, useClass: InMemorySessionStore },
  { provide: TRACE_PORT, useFactory: () => new PrismaTrace(defaultTenantId()) },
];

const defaultPortProviders: Provider[] =
  process.env.DATA_ADAPTER === "prisma" ? prismaPortProviders : inMemoryPortProviders;

const toolsServiceProvider: Provider = {
  provide: ToolsService,
  useFactory: (
    bobi: BoBiReadPort,
    notifications: NotificationsPort,
    tickets: TicketRepository,
    knowledge: KnowledgeRepository,
    callbacks: CallbackRepository,
    sessions: SessionStore,
    trace: TracePort,
  ): ToolsService => {
    const deps: ToolsDeps = {
      bobi,
      notifications,
      tickets,
      knowledge,
      callbacks,
      sessions,
      trace,
    };
    return new ToolsService(deps);
  },
  inject: [
    BOBI_READ,
    NOTIFICATIONS,
    TICKET_REPO,
    KNOWLEDGE_REPO,
    CALLBACK_REPO,
    SESSION_STORE,
    TRACE_PORT,
  ],
};

// ToolsController 는 (ToolsService, CustomToolExecutor?) 를 받는다. NestJS 는
// 생성자 파라미터 타입 메타데이터로 ToolsService/CustomToolExecutor 를 자동
// 해석하므로(둘 다 구체 클래스 provider) 별도 useFactory 없이 controllers 배열
// 등록만으로 DI 가 연결된다 — CustomToolExecutor 는 TenantModule 의 export.
@Module({
  imports: [TenantModule],
  controllers: [ToolsController],
  providers: [...defaultPortProviders, toolsServiceProvider],
  exports: [ToolsService],
})
export class ToolsModule {}
