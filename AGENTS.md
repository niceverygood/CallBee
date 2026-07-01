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

## 워크스페이스 규약 (구현 세부)
- 패키지 네임스페이스: `@colli/*` (contracts=`@colli/contracts`, db=`@colli/db`).
- 패키지 매니저: pnpm workspace. 워크스페이스 참조는 `workspace:*`.
- 공유 계약은 `@colli/contracts` 에서만 import 한다. tool 스키마/타입을 로컬에 복제하지 말 것.
- Worker별 상세 입력계약은 `/docs/worker-contracts.md` 참조.
