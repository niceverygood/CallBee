# Colli-BoBi — BoBi 고객센터

보험설계사(BoBi 유료 구독자)의 문의 전화를 AI가 실시간으로 받아 응대하는 고객센터.
070 인바운드 → 본인확인 → 의도분류 → (KB 응답 / 티켓 / 셀프서비스 / 영업 인계) → 카카오 알림톡.

> 프로젝트 규칙·가드레일은 [`CLAUDE.md`](./CLAUDE.md), Worker 착수 계약은 [`docs/worker-contracts.md`](./docs/worker-contracts.md) 참조.

## 구조 (pnpm 모노레포)

| 위치 | 패키지 | 소유 | 상태 |
|---|---|---|---|
| `packages/contracts` | `@colli/contracts` | Orchestrator | ✅ 완성 (단일 소스) |
| `packages/db` | `@colli/db` | Orchestrator | ✅ Prisma 스키마 + 클라이언트 |
| `apps/voice` | `@colli/voice` | Worker A | 🔲 스텁 |
| `apps/api` | `@colli/api` | Worker C(+B) | 🔲 스텁 |
| `apps/admin` | `@colli/admin` | Worker E | 🔲 스텁 |
| `services/notifications` | `@colli/notifications` | Worker D | 🔲 스텁 |
| `services/compliance` | `@colli/compliance` | Worker F | 🔲 스텁 |

## 개발 환경

- Node ≥ 22, pnpm 10

```bash
cd /Users/seungsoohan/Projects/CallBee
cp .env.example .env          # 값 채우기 (ClawOps/OpenAI/Kakao/BoBi/PII 키)
pnpm install
pnpm db:generate              # Prisma 클라이언트 생성
pnpm build                    # 전체 빌드
```

로컬 PostgreSQL 준비 후 최초 마이그레이션:

```bash
cd /Users/seungsoohan/Projects/CallBee
pnpm --filter @colli/db exec prisma migrate dev --name init
```

## 다음 단계

`docs/worker-contracts.md` 의 Worker A~F 를 병렬 세션/서브에이전트로 dispatch → 통합 체크포인트 → 파일럿.
