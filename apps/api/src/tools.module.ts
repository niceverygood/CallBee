/**
 * ToolsModule — ToolsService + 포트 바인딩을 조립하는 얇은 NestJS 모듈.
 *
 * 기본 바인딩은 인메모리 어댑터(데모/로컬). 통합 시 Orchestrator/Worker A 가
 * 각 토큰을 실구현(Prisma repo / Redis session / Worker D notifications)으로 override 한다.
 * main.ts 는 이 모듈만 부트스트랩한다(포트 실배선은 하지 않음).
 *
 * v2(멀티테넌트) 확장: ToolsController 가 CustomToolExecutor(TenantModule 소유)를
 * 선택적으로 주입받아 name ∉ SYSTEM_TOOL_NAMES 인 tool 호출을 위임한다
 * (tools.controller.ts 참조). TenantModule 을 import 해 NestJS DI 로 실제
 * CustomToolExecutor 인스턴스를 연결한다.
 */
import { Module, type Provider } from "@nestjs/common";
import { ToolsController } from "./tools.controller.js";
import { ToolsService, type ToolsDeps } from "./tools.service.js";
import { TenantModule } from "./tenant.module.js";
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
import type {
  BoBiReadPort,
  NotificationsPort,
  TicketRepository,
  KnowledgeRepository,
  CallbackRepository,
  SessionStore,
  TracePort,
} from "./ports.js";

// 기본(인메모리) 포트 프로바이더. 통합 시 override.
const defaultPortProviders: Provider[] = [
  { provide: BOBI_READ, useClass: InMemoryBoBiRead },
  { provide: NOTIFICATIONS, useClass: InMemoryNotifications },
  { provide: TICKET_REPO, useClass: InMemoryTicketRepository },
  { provide: KNOWLEDGE_REPO, useClass: InMemoryKnowledgeRepository },
  { provide: CALLBACK_REPO, useClass: InMemoryCallbackRepository },
  { provide: SESSION_STORE, useClass: InMemorySessionStore },
  { provide: TRACE_PORT, useClass: InMemoryTrace },
];

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
