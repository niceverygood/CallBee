# Worker 입력 계약 (Colli-BoBi)

> **단일 소스:** `@colli/contracts`. 모든 Worker 는 타입/스키마/상수를 여기서만 import 한다.
> 계약 변경은 **Orchestrator 승인 후**에만 전파한다(`CONTRACTS_VERSION` 증가).
> 각 Worker 는 "무엇을 신뢰하고(입력), 무엇을 구현하는가(산출물)"를 아래에서 확인하고 착수한다.

## 공유 자산 (이미 확정됨)

| 자산 | 위치 | 소유 |
|---|---|---|
| 도메인 타입·enum | `@colli/contracts` (`domain.ts`) | Orchestrator |
| tool 시그니처 + JSON 스키마 | `@colli/contracts` (`tools.ts`, `TOOL_SCHEMAS`) | Orchestrator |
| ClawOps 웹훅 이벤트 | `@colli/contracts` (`webhooks.ts`) | Orchestrator |
| 카카오 템플릿 키·변수 | `@colli/contracts` (`kakao.ts`) | Orchestrator |
| Prisma 스키마(신규 7테이블+trace) | `@colli/db` (`prisma/schema.prisma`) | Orchestrator |

**신규 테이블:** `CallSession`, `Transcript`, `Ticket`, `KnowledgeItem`, `Notification`, `ConsentRecord`, `CallbackRequest` (+ 관측성 `ToolInvocation`).
**읽기 전용 연동:** `Subscriber`/`Subscription` — BoBi 기존 DB/API. Prisma 모델 없음. Worker C 의 read 어댑터가 `SubscriberProfile` 로 반환.

---

## Worker A — Telephony / Voice (`/apps/voice`)
- **신뢰(입력):** `ClawOpsEvent`, `VoiceAgentMode`, `TOOL_SCHEMA_LIST`(세션 tool 바인딩), Worker B 의 system prompt, Worker C 의 tool 엔드포인트.
- **구현:** ClawOps 인바운드 세션 핸들러, `/voice` 웹훅 라우트(`call.*`, `recording.completed`), Realtime|Pipeline 어댑터, barge-in/warm transfer/hang_up/DTMF/녹음.
- **경계:** tool 실행은 HTTP 로 Worker C 에 위임(`ToolInvocationResult`). tool 구현·대화 정책·알림·대시보드는 범위 밖.
- **완료 기준:** 데모 통화 수신→AI 응대→tool 1개 호출→warm transfer/hang_up 왕복, 녹음·전사 저장.

## Worker B — Dialogue Engine (`/apps/api/dialogue` 또는 `/packages/dialogue`)
- **신뢰:** `Intent`(7종), `TOOL_SCHEMAS`, `SalesReason`/`SelfServiceKind`/`EscalationTarget`, `Emotion`.
- **구현:** system prompt(친절·간결, 한 번에 한 질문, 이름/번호/날짜 복창), 의도 분류, 의도별 tool 라우팅 + fallback/escalation:
  - 의도 파악 2회 실패 → `request_callback` (무한 루프 금지)
  - upgrade/churn/new_signup → `route_to_sales`
  - tech_error → `create_ticket`
  - billing → `send_selfservice_link` (카드정보 음성수집 금지)
  - 보험상품 판단/진단 → `escalate_to_human`
  - 감정(angry/urgent) → 사과·속도조절·우선 인계 힌트
- **경계:** SDK 세션 배선(A), tool 실제 구현(C) 제외.
- **완료 기준:** 7개 의도 각각 올바른 tool 경로/인계 선택 단위테스트 통과.

## Worker C — Backend / Data / Tools (`/apps/api`)
- **신뢰:** `ToolIO`(params/result), `TOOL_NAMES`, `@colli/db` Prisma 클라이언트, `SubscriberProfile`.
- **구현:** 8개 tool 을 NestJS 엔드포인트로. `lookup_subscriber`(본인확인), `get_kb_answer`, `create_ticket`, `route_to_sales`, `send_selfservice_link`, `request_callback`, `escalate_to_human`, `send_kakao_alimtalk`(→ D 위임). BoBi 구독 read 어댑터, 티켓 CRUD, KB 저장/검색, 콜백 큐, Redis 세션, 통화로그·전사 저장, `ToolInvocation` trace.
- **경계:** 대화 정책(B), 세션 배선(A), 알림 발송 로직(D), 프론트(E) 제외.
- **완료 기준:** 각 tool 이 계약 시그니처대로 동작. 본인확인→구독조회→티켓생성 경로 통과. 상태 변경은 전부 tool 경유.

## Worker D — Notifications (`/services/notifications`)
- **신뢰:** `KakaoTemplateKey`, `KakaoTemplateVarMap`, `KakaoDeliveryStatus`, `Notification` 테이블.
- **구현:** 카카오 알림톡 어댑터(대행사 교체 가능 인터페이스), 5개 템플릿 렌더러, 발송+상태추적(발송/도달/실패)+재시도, `Notification` 기록.
- **경계:** 대화 로직·tool 라우팅 제외. `send_kakao_alimtalk` tool 로 C/B 가 호출.
- **완료 기준:** 5개 템플릿 변수 바인딩 발송·상태기록, 실패 시 재시도. mock 대행사로 테스트 통과.

## Worker E — Admin Dashboard (`/apps/admin`, React+Vite+Tailwind)
- **신뢰:** Worker C 의 API, `CallOutcome`/`Intent`/`Emotion`/`TicketStatus`/`CallbackStatus` 라벨.
- **구현:** 통화 목록/상세(녹취·전사·요약), 티켓 보드, 콜백 큐, KB 편집기, 지표 카드(응대율·자동해결률·인계수·콜백대기). 옵션: 기존 BoBi 어드민 서브라우트 통합 우선 검토.
- **경계:** 백엔드 로직(C), 음성(A) 제외.
- **완료 기준:** 통화·티켓·KB 조회/편집 가능, 지표 카드 실데이터 렌더.

## Worker F — Compliance / Security (`/services/compliance`, 횡단)
- **신뢰:** `ConsentRecord` 테이블, GUARDRAILS(CLAUDE.md), `SelfServiceKind`.
- **구현:** 통화 초입 고지 멘트(AI+녹음)+동의 로깅, PII 암호화·최소권한 유틸, 본인확인 게이트, **결제정보 음성수집 차단 가드**(카드/계좌/CVC 탐지·마스킹 → `send_selfservice_link` 강제), AI기본법 대응 훅, 감사 로그.
- **경계:** 기능 자체 구현(각 Worker) 제외 — 가드·게이트·로깅을 각 트랙에 끼운다.
- **완료 기준:** 카드번호를 말해도 전사·저장에 안 남고 셀프서비스로 우회. 모든 통화에 고지·동의 기록.

---

## 통합 순서 (Orchestrator)
1. C(tool)+A(세션)+F(가드) → 수신→본인확인→tool 1개 왕복
2. B(정책) 결합 → 7개 의도 라우팅 실통화 동작
3. D(알림) 결합 → 접수/티켓/결과/콜백 알림톡
4. E(대시보드)에서 통화·티켓·요약 확인
