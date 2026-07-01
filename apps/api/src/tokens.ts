/**
 * NestJS DI 토큰(포트 바인딩용). 인터페이스는 런타임에 없으므로 심볼/문자열 토큰을 쓴다.
 * 통합 배선(Worker A/Orchestrator)에서 이 토큰에 실구현(Prisma/Redis/Worker D)을 바인딩한다.
 */
export const BOBI_READ = Symbol("BoBiReadPort");
export const NOTIFICATIONS = Symbol("NotificationsPort");
export const TICKET_REPO = Symbol("TicketRepository");
export const KNOWLEDGE_REPO = Symbol("KnowledgeRepository");
export const CALLBACK_REPO = Symbol("CallbackRepository");
export const SESSION_STORE = Symbol("SessionStore");
export const TRACE_PORT = Symbol("TracePort");
