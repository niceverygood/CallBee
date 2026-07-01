# BoBi 고객센터 — 클로드코드 빌드 프롬프트 패키지 v1
### PM Orchestrator + Parallel Workers · ClawOps 070 인프라 기반

> 이 문서는 **복붙해서 바로 쓰는 프롬프트 모음**이다. 순서: 새 레포 생성 → `CLAUDE.md` 루트에 저장 → **Orchestrator 프롬프트**로 공유 계약 확정 → **Worker A~F**를 병렬 세션(또는 서브에이전트)으로 dispatch → **통합 체크포인트** → 파일럿.

---

## 0. 스택 & 핵심 결정 (프롬프트에 이미 반영됨)

- **전화망·음성:** ClawOps (`@teamlearners/clawops`) — 070 발급·SIP·미디어·녹음·전사·warm transfer 관리형. Voice Agent SDK로 **OpenAI Realtime**(기본) / Gemini Realtime / Pipeline(Deepgram+LLM+ElevenLabs) 선택. → **Worker A가 얇아진다.**
- **백엔드:** Node.js + TypeScript + NestJS · PostgreSQL + Prisma · Redis(세션)
- **프론트(어드민):** React + Vite + TypeScript + Tailwind
- **알림:** 카카오 알림톡(비즈메시지 대행) 어댑터
- **결제:** 신규 연동 없음. 구독 상태는 **읽기 전용**으로 조회, 결제 변경은 셀프서비스 링크로만.
- **원칙:** 상태 변경은 결정론적 tool 함수로만 / 결제정보 음성 수집 금지 / 외부 의존은 어댑터로 캡슐화.

---

## 1. `CLAUDE.md` (레포 루트에 저장 — 클로드코드가 자동 로드)

```markdown
# BoBi 고객센터 (프로젝트 코드네임: Colli-BoBi)

## 무엇을 만드나
보험설계사(BoBi 유료 구독자)의 문의 전화를 AI가 실시간으로 받아 응대하는 고객센터.
070 번호로 인바운드 콜 수신 → 본인확인 → 의도분류 → (지식베이스 응답 / 티켓 생성 /
셀프서비스 링크 / 영업·리텐션 인계) → 카카오 알림톡 후속.

## 절대 규칙 (GUARDRAILS — 위반 금지)
1. 결제수단·카드번호·CVC·계좌 정보는 음성으로 수집/복창/저장하지 않는다. 결제 변경은 셀프서비스 링크로만 유도.
2. 상태를 바꾸는 행동(티켓 생성, 구독 조회, 인계, 알림 발송)은 반드시 tool 함수 호출로만 한다. LLM 자유서술로 상태를 만들지 않는다.
3. 통화 초입에 "AI 응대 + 녹음" 고지를 하고 동의를 로깅한다(AI기본법·개인정보).
4. 개인정보·구독 조회는 본인확인(가입 전화번호 매칭) 후에만 한다. 저장 시 암호화, 최소권한.
5. 보험상품 권유·판단·진단성 발언 금지. 응대 범위는 BoBi(SaaS) 지원으로 한정. 범위 밖은 사람 인계.
6. 외부 의존(ClawOps / LLM / Kakao / BoBi DB)은 어댑터로 감싸 교체 가능하게 한다.
7. 관측성: 통화별 로그·요약·실패사유·tool 호출 trace를 남긴다.

## 스택
- 음성/전화: ClawOps SDK (@teamlearners/clawops, /agent), OpenAI Realtime 기본
- 백엔드: NestJS + TypeScript, PostgreSQL + Prisma, Redis
- 프론트: React + Vite + Tailwind
- 알림: 카카오 알림톡(비즈메시지 대행) 어댑터

## 디렉토리
/apps/voice        ClawOps 인바운드 세션 핸들러 (Worker A)
/apps/api          NestJS: tools 구현 + 대화 정책 바인딩 (Worker C, B)
/apps/admin        관리자 대시보드 (Worker E)
/packages/contracts 공유 타입·tool 스키마·이벤트 shape (Orchestrator가 소유)
/packages/db       Prisma 스키마 + 클라이언트
/services/notifications 카카오 알림톡 어댑터 (Worker D)
/services/compliance    고지·동의·보안 가드 (Worker F)

## 빌드 원칙
- 인터페이스(타입·계약) 먼저 → 구현 → 유닛테스트 → 통합 데모.
- /packages/contracts 는 단일 소스. 변경은 Orchestrator 승인 후 전파.
- 매 통합 지점마다 E2E 통화 시나리오로 회귀 검증.
```

---

## 2. 공유 계약 스켈레톤 (Orchestrator가 먼저 확정)

`/packages/contracts` 에 들어갈 골격. Orchestrator가 이걸 완성·고정한 뒤 Worker에 배포한다.

**(a) Tool 함수 시그니처 (LLM function calling + 백엔드 구현 공용)**
```
lookup_subscriber(phone) -> { subscriberId, name, tier, status, billingState } | null
get_kb_answer(query, category?) -> { answer, sourceId, confidence }
create_ticket(subscriberId, category, summary, severity) -> { ticketId, status }
route_to_sales(subscriberId, reason: 'upgrade'|'churn'|'new_lead', context) -> { routed, mode: 'warm_transfer'|'callback_queued' }
send_selfservice_link(subscriberId, kind: 'billing'|'password'|'plan_change') -> { sent: boolean, channel: 'alimtalk' }
request_callback(subscriberId|phone, summary, urgency) -> { callbackId }
escalate_to_human(reason, target: 'sales'|'dev'|'cs') -> { transferInitiated: boolean }
send_kakao_alimtalk(templateKey, to, vars) -> { messageId, status }
```

**(b) Prisma 스키마 — 신규 테이블**
`CallSession`, `Transcript`, `Ticket`, `KnowledgeItem`, `Notification`, `ConsentRecord`, `CallbackRequest`
**읽기 전용 연동:** `Subscriber`, `Subscription` (BoBi 기존 DB/API — 어댑터 경유)

**(c) ClawOps 웹훅 이벤트 shape**
`call.initiated` · `call.ringing` · `call.answered` · `call.ended` · `recording.completed`
(각 이벤트: callId, from, to, timestamp, payload)

**(d) 카카오 알림톡 템플릿 키**
`cs_received`(접수확인) · `ticket_created`(티켓번호) · `ticket_resolved`(처리결과) · `callback_scheduled`(콜백안내) · `selfservice_link`(셀프서비스 링크)

---

## 3. Orchestrator 프롬프트 (복붙)

```
너는 프로젝트 "Colli-BoBi"(BoBi 고객센터)의 PM Orchestrator다.
목표: CLAUDE.md에 정의된 MVP를 병렬 Worker로 구현 가능한 코드베이스로 만든다.

지금 할 일 (1단계):
1) 모노레포를 스캐폴딩한다(pnpm workspace, 위 디렉토리 구조).
2) /packages/contracts 를 완성한다 — 위 "공유 계약 스켈레톤"을 실제 TypeScript 타입,
   tool JSON 스키마, 웹훅 이벤트 타입, 카카오 템플릿 키 상수로 확정한다. 이게 단일 소스다.
3) /packages/db 에 Prisma 스키마(신규 테이블 + 읽기전용 연동 인터페이스)를 작성하고 초기 마이그레이션을 만든다.
4) 각 Worker(A~F)가 착수할 수 있도록, Worker별 "입력 계약(무엇을 신뢰하고 무엇을 구현하는가)"을
   /docs/worker-contracts.md 에 정리한다.

원칙:
- 상태 변경은 tool 함수로만. 결제정보 음성 수집 금지(가드는 Worker F가 강제).
- 계약 변경은 네 승인 후에만 전파한다.
- 지금은 구현이 아니라 "계약 + 스캐폴딩 + 스키마"까지만. 완료되면 나에게 Worker 착수 준비 완료를 보고하라.
```

---

## 4. Worker 프롬프트 A~F (각각 새 세션/서브에이전트에 복붙)

### Worker A — Telephony / Voice
```
너는 Colli-BoBi의 Worker A(전화망·음성)다. 먼저 CLAUDE.md와 /packages/contracts, /docs/worker-contracts.md 를 읽어라.

범위 (/apps/voice):
- ClawOps SDK(@teamlearners/clawops, /agent)로 070 번호에 인바운드 세션을 붙인다.
- 웹훅 수신 엔드포인트(/voice)를 만들어 call.initiated~ended, recording.completed 이벤트를 처리한다.
- Voice Agent는 OpenAI Realtime 세션으로 구성한다(교체 가능하게 어댑터로 감쌈: Realtime|Pipeline).
- 세션에 Worker B가 정의한 대화 정책(system prompt)과 tool 스키마를 바인딩하고,
  tool 실행은 Worker C의 백엔드 tool 엔드포인트로 위임한다.
- barge-in(끼어들기), warm transfer(→ 영업/CS 번호), hang_up, DTMF, 녹음을 지원한다(SDK 내장 기능 사용).

범위 밖: tool 구현(C), 대화 정책 내용(B), 알림 발송(D), 대시보드(E).

산출물: /apps/voice 세션 핸들러, ClawOps 어댑터, 웹훅 라우트, 로컬 테스트 스크립트(managed inbound).
완료 기준: 데모 통화가 수신→AI 응대→tool 1개 호출→warm transfer/hang_up까지 왕복한다. 통화 녹음·전사가 저장된다.
```

### Worker B — Dialogue Engine (대화 정책)
```
너는 Colli-BoBi의 Worker B(대화 엔진)다. 먼저 CLAUDE.md와 /packages/contracts 를 읽어라.

범위 (/apps/api/dialogue 또는 /packages/dialogue):
- BoBi 상담용 system prompt를 작성한다(톤: 친절·간결, 한 번에 하나 질문, 이름/번호/날짜는 복창 확인).
- 의도 분류 정책: 사용법 / 결제 / 기술오류 / 요금제·업그레이드 / 해지 / 신규가입 / 기타.
- 의도별 tool 라우팅 규칙과 fallback/escalation 정책을 정의한다:
  · 2회 이상 의도 파악 실패 → request_callback 으로 전환(무한 루프 금지)
  · 업그레이드/해지/신규 → route_to_sales(이종인)  · 기술오류 → create_ticket(개발팀)
  · 결제 변경 → send_selfservice_link (카드정보 음성 수집 절대 금지)
  · 임상/보험상품 판단·진단 요청 → 정중히 인계
- 감정 태깅(화남/긴급) 시 사과·속도조절·우선 인계 힌트를 남긴다.

범위 밖: SDK 세션 배선(A), tool 실제 구현(C).

산출물: system prompt, tool 바인딩 스펙(스키마는 contracts 사용), 라우팅/에스컬레이션 정책 모듈, 시나리오 테스트 케이스.
완료 기준: 7개 의도 각각에 대해 올바른 tool 경로/인계가 선택되는 단위 테스트가 통과한다.
```

### Worker C — Backend / Data / Tools
```
너는 Colli-BoBi의 Worker C(백엔드·데이터·tool)다. 먼저 CLAUDE.md와 /packages/contracts, /packages/db 를 읽어라.

범위 (/apps/api):
- 공유 계약의 tool 함수를 NestJS 엔드포인트로 구현한다:
  lookup_subscriber, get_kb_answer, create_ticket, route_to_sales,
  send_selfservice_link, request_callback, escalate_to_human, send_kakao_alimtalk(→ D에 위임).
- BoBi 기존 구독 시스템에 대한 읽기 전용 어댑터(Subscriber/Subscription 조회, 가입번호 본인확인)를 만든다.
- 티켓 CRUD, 지식베이스 저장/검색(카테고리 + 키워드/임베딩 매칭), 콜백 큐를 구현한다.
- Redis 세션(통화별 상태), 통화로그·전사 저장.

범위 밖: 대화 정책(B), 세션 배선(A), 알림 템플릿 발송 로직(D), 프론트(E).

산출물: tool 엔드포인트, BoBi 구독 read 어댑터, 티켓·KB·콜백 서비스, 유닛테스트.
완료 기준: 각 tool이 계약 시그니처대로 동작하고, 본인확인→구독조회→티켓생성 경로가 통과한다. 상태 변경은 전부 tool을 통해서만 일어난다.
```

### Worker D — Notifications (카카오 알림톡)
```
너는 Colli-BoBi의 Worker D(알림)다. 먼저 CLAUDE.md와 /packages/contracts 를 읽어라.

범위 (/services/notifications):
- 카카오 알림톡(비즈메시지 대행) 어댑터를 만든다(대행사 교체 가능하게 인터페이스 분리).
- 템플릿 키 구현: cs_received, ticket_created, ticket_resolved, callback_scheduled, selfservice_link.
- 발송 + 상태추적(발송/도달/실패), 실패 재시도. Notification 테이블에 기록.
- send_kakao_alimtalk tool을 통해 C/B가 호출.

범위 밖: 대화 로직, tool 라우팅.

산출물: 카카오 어댑터, 템플릿 렌더러, 발송/상태 서비스, 목(mock) 대행사로 통과하는 테스트.
완료 기준: 5개 템플릿이 변수 바인딩되어 발송·상태기록되고, 실패 시 재시도한다.
```

### Worker E — Admin Dashboard
```
너는 Colli-BoBi의 Worker E(관리자 대시보드)다. 먼저 CLAUDE.md와 /packages/contracts 를 읽어라.

범위 (/apps/admin, React+Vite+Tailwind):
- 통화 목록(발신번호/의도/결과/감정) + 통화 상세(녹취 재생·전사·요약).
- 티켓 보드(상태·담당·심각도), 콜백 큐.
- 지식베이스 편집기(카테고리별 FAQ CRUD).
- 대시보드 지표: 응대율, 티켓 자동해결률, 인계 수, 콜백 대기.
- (옵션) 기존 BoBi 어드민에 서브라우트로 얹는 통합안 우선 검토.

범위 밖: 백엔드 로직(C), 음성(A).

산출물: 대시보드 화면, C의 API 소비 훅, 기본 접근권한.
완료 기준: 통화·티켓·KB를 조회/편집할 수 있고, 지표 카드가 실데이터로 렌더된다.
```

### Worker F — Compliance / Security (횡단)
```
너는 Colli-BoBi의 Worker F(규제·보안)다. 먼저 CLAUDE.md의 GUARDRAILS를 읽어라. 너는 전 트랙을 횡단해 규칙을 강제한다.

범위 (/services/compliance):
- 통화 초입 고지 멘트(AI 응대 + 녹음)와 동의 로깅(ConsentRecord)을 구현한다.
- 개인정보 저장 암호화·최소권한 유틸, 가입번호 본인확인 게이트.
- **결제정보 음성 수집 차단 가드**: 대화/전사 파이프라인에서 카드·계좌·CVC 패턴을 탐지·마스킹하고,
  결제 관련 의도는 반드시 send_selfservice_link 로만 흐르도록 정책 훅을 강제한다.
- AI기본법 대응 훅(고지·표시 상태 점검), 감사 로그.

범위 밖: 기능 자체 구현(각 Worker) — 너는 가드·게이트·로깅을 제공하고 각 트랙에 끼운다.

산출물: 고지/동의 모듈, PII 암호화·마스킹 유틸, 결제정보 차단 미들웨어, 감사 로그.
완료 기준: 카드번호를 말해도 전사·저장에 남지 않고 셀프서비스로 우회된다. 모든 통화에 고지·동의가 기록된다.
```

---

## 5. 통합 & E2E 체크포인트 프롬프트 (복붙)

```
너는 Orchestrator다. Worker A~F 산출물을 통합하고 E2E로 검증하라.

통합 순서:
1) C(tool)+A(세션)+F(가드) 연결 → 수신→본인확인→tool 1개 왕복.
2) B(정책) 결합 → 7개 의도 라우팅이 실통화에서 동작.
3) D(알림) 결합 → 접수/티켓/결과/콜백 알림톡 발송.
4) E(대시보드)에서 통화·티켓·요약 확인.

E2E 회귀 시나리오(모두 통과해야 함):
- 사용법 문의 → KB 응답 → 종료 → cs_received 알림
- 결제 문의 → 본인확인 → 셀프서비스 링크(카드정보 미수집 확인)
- 기술오류 → 티켓 생성 → ticket_created 알림 → 대시보드 반영
- 업그레이드/해지 → 이종인 warm transfer(또는 콜백 큐)
- 야간 처리불가 → request_callback → 익일 요약

통과 후: 소수 설계사 대상 파일럿 배포 체크리스트를 작성하라.
```

---

## 6. Guardrails 체크리스트 (배포 전 최종 점검)

- [ ] 카드·계좌·CVC를 말해도 전사·로그·DB에 남지 않는다(마스킹 확인)
- [ ] 결제 변경은 100% 셀프서비스 링크로만 흐른다
- [ ] 모든 통화에 AI 응대·녹음 고지 + 동의 로깅
- [ ] 구독·개인정보 조회는 본인확인 후에만
- [ ] 상태 변경은 전부 tool 함수 경유(자유서술로 상태 변경 불가)
- [ ] 보험상품 권유·진단성 발언 없음(범위 밖은 인계)
- [ ] ClawOps/LLM/Kakao/BoBi DB가 어댑터로 캡슐화되어 교체 가능
- [ ] 통화별 trace·요약·실패사유 관측 가능

---

*문서 끝. 이 패키지로 `CLAUDE.md` 저장 → Orchestrator 실행 → Worker 병렬 dispatch 하면 된다. 다음으로 BoBi 지식베이스 시드(반복 CS 질문 TOP 30)나 카카오 알림톡 템플릿 문구를 채워주면 착수 즉시 실데이터로 돈다.*
