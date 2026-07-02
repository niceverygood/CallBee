# 콜비(Callbee) 제품 기획서 — 셀프 가입·승인 플로우 & 사업장 커스텀 v3

> **버전:** v3 (2026-07) · **작성:** Orchestrator(수석 프로덕트 디자이너 겸 아키텍트)
> **단일 소스:** `@colli/contracts`(v0.4.0) + `@colli/db`(prisma/schema.prisma).
> 브랜드/비주얼 규칙은 `/docs/brand-guide.md`, 아키텍처 배경은 `/docs/tenant-platform-architecture.md` 참조.
> 이 문서의 화면·문구는 Implement 워커(api/console/admin/dialogue)가 그대로 구현하는 기준 스펙이다.

---

## 0. 제품 한 줄 정의

**콜비(Callbee)는 온·오프라인 사업장의 전화 고객센터를 AI가 대신 받아주는 서비스다.**
사업장 운영자(사장님)가 직접 가입하고, 업종과 요금제를 고르고, 승인받은 070 번호로
AI 상담원이 전화를 받는다. 인사말·응대 톤·영업시간·호전환·문자 안내까지 전부
사장님이 콘솔에서 직접 설정한다.

### v3 에서 바뀌는 것 (v2 → v3)

| 영역 | v2 (현재) | v3 (이번 재구조화) |
|---|---|---|
| 가입 | 총괄관리자가 admin 에서 계정을 만들어 줌 | **고객이 직접 3단계 위저드로 신청 → 관리자는 승인만** (관리자 직접 생성도 유지) |
| 070 번호 | 신청 시 고객이 입력 | **승인 시 관리자가 배정** (현실 플로우) |
| 커스텀 | 프로필/톤/의도/tool/KB | + **마무리 멘트, 영업시간, 영업시간 외 응대, 호전환, 긴급 키워드, 문자 안내** |
| 콘솔 | 설정 4탭만 | **대시보드/통화 기록/에이전트 스튜디오/운영 설정** 으로 IA 재편 |
| 브랜드 | 무채색 프로토타입 | **콜비 브랜드(허니 앰버+잉크) 전면 리브랜딩** — brand-guide.md |

---

## 1. 페르소나 & 유저 저니

### 1.1 페르소나

**P1. 김윤정 (38) — 동네 파스타집 사장 (주 타깃)**
- 점심·저녁 피크에 예약 전화를 못 받아 손님을 놓친다. 직원은 홀 서빙만으로 벅참.
- IT 숙련도 낮음. "설정"이라는 말만 들어도 부담. 배민 사장님 앱 정도는 쓴다.
- 원하는 것: *"전화 좀 대신 받아줘. 예약이랑 영업시간 물어보는 것만이라도."*
- 콜비에서의 성공: 가입 10분, 승인 후 30분 안에 첫 설정 완료, 놓치는 전화 0건.

**P2. 박태호 (45) — 피부과 원장 (확장 타깃)**
- 데스크 직원 2명이 하루 200통을 받는다. 절반이 "오늘 진료해요?", "예약 변경이요".
- 의료광고·의료조언 규제에 민감. AI가 허튼소리 하는 게 제일 무섭다.
- 원하는 것: 반복 문의 자동화 + **금지사항을 확실히 걸 수 있는 통제감**.
- 콜비에서의 성공: 업종 특화 금지사항("의료 조언 금지")을 직접 걸고, 긴급 환자는 즉시 데스크로 호전환.

**P3. 콜비 총괄관리자 (내부 운영자)**
- 신청 큐를 매일 확인해 심사한다. 070 번호 재고를 관리하며 승인 시 배정.
- 원하는 것: 신청 정보(업종/연락처/요금제)를 한 화면에서 보고 1분 안에 승인/반려.

### 1.2 유저 저니 (사업장 운영자 관점)

```
발견 ─▶ 가입 ─▶ 신청 ─▶ 승인 대기 ─▶ 온보딩 ─▶ 커스텀 ─▶ 운영
```

| 단계 | 사용자 행동 | 시스템/화면 | 성공 기준 |
|---|---|---|---|
| ① 발견 | 검색/소개로 랜딩 도착 | `/` 랜딩(리브랜딩) — 가치제안·업종 카드·요금제 | CTA "무료로 시작하기" 클릭률 |
| ② 가입 | 이메일/비밀번호 입력 | `/signup` 위저드 1단계 | 이탈 없이 2단계 진입 |
| ③ 신청 | 사업장 정보+요금제 선택 후 제출 | 위저드 2·3단계 → `POST /signup` | 계정+사업장(승인대기) 생성, 자동 로그인 |
| ④ 승인 대기 | 대기 화면 확인, (반려 시) 사유 확인 | `/pending` — 상태·예상 소요·문의 안내 | 대기 중 이탈 방지(안내 명확성) |
| ⑤ 온보딩 | 승인 후 첫 로그인 — 070 번호 확인 | 대시보드 첫 방문 배너 + 설정 체크리스트 | 첫 설정(인사말) 24시간 내 완료 |
| ⑥ 커스텀 | 인사말/영업시간/문자 등 설정 | 에이전트 스튜디오 + 운영 설정 | 통화 미리보기로 확인 후 저장 |
| ⑦ 운영 | 통화 기록 확인, 설정 미세조정 | 대시보드/통화 기록 | 주 1회 이상 재방문 |

**저니의 핵심 원칙**
1. **신청은 3분, 설정은 승인 후에.** 위저드에서 설정을 요구하지 않는다(업종/요금제 선택만).
   커스텀은 승인 후 콘솔에서 체크리스트로 유도한다.
2. **승인 대기는 침묵시키지 않는다.** 대기 화면에 "무엇을 심사하는지, 보통 얼마나 걸리는지,
   승인되면 무슨 일이 생기는지"를 명시한다.
3. **모든 설정은 "통화에 어떻게 반영되는지"를 함께 보여준다.** 설정 폼 옆에 프롬프트/멘트
   미리보기(§4 각 기능의 "통화 반영" 참조).

---

## 2. 가입 위저드 (3단계) 상세

- 라우트: `/signup` (apps/console, 공개 — 로그인 불필요). 랜딩의 모든 CTA 가 여기로 연결.
- 계약: `SignupRequest` → `SignupResult` (`@colli/contracts/auth.ts`). API: `POST /signup`(무인증).
- 진행 표시: 상단 스텝퍼 `① 계정 만들기 → ② 사업장 정보 → ③ 요금제 선택`.
  이전 단계로 자유롭게 되돌아갈 수 있고 입력값은 유지된다(제출은 3단계에서 한 번만).
- 제출 성공 시: 계정 + 사업장(status=`pending_approval`) + 기본 에이전트 설정이 **하나의
  트랜잭션**으로 생성되고, `SignupResult.token` 으로 **자동 로그인** → `/pending` 이동.

### 2.1 ① 계정 만들기

| 필드 | 타입 | 검증 규칙 | 에러 문구(사용자 노출) |
|---|---|---|---|
| 이메일 | email | 형식 검증(RFC 간이), 소문자 정규화 | "이메일 형식을 확인해 주세요" |
| 비밀번호 | password | 8자 이상, 공백 불가 | "비밀번호는 8자 이상이어야 해요" |
| 비밀번호 확인 | password | 위와 일치 | "비밀번호가 서로 달라요" |

- 이메일 중복은 **제출 시점**(3단계) 서버 검증으로 확정한다(`email_already_exists`).
  에러 시 1단계로 되돌리고 필드에 인라인 표시: "이미 가입된 이메일이에요. 로그인해 주세요."
  + "로그인하기" 링크.
- 하단 보조 링크: "이미 계정이 있으신가요? 로그인" → `/login`.

### 2.2 ② 사업장 정보

| 필드 | 타입 | 검증 규칙 | 에러 문구 |
|---|---|---|---|
| 사업장 이름 | text | 1~60자, 공백만은 불가 | "사업장 이름을 입력해 주세요" |
| 업종 | 프리셋 카드 선택(단일) | `INDUSTRY_PRESETS` 8종 중 1개 필수 | "업종을 선택해 주세요" |
| 업종 직접 입력 | text | 업종="기타" 선택 시에만 노출·필수, 1~30자 | "업종을 입력해 주세요" |
| 사업장 연락처 | tel | 숫자/하이픈만, 9~13자리 | "연락처 형식을 확인해 주세요" |

**업종 프리셋 (`INDUSTRY_PRESETS`, key 고정 — UI 는 label 만 노출)**

| key | 라벨 | 카드 서브카피 |
|---|---|---|
| `restaurant_cafe` | 식당·카페 | 예약, 영업시간, 메뉴 문의 전화를 대신 받아요. |
| `hospital_clinic` | 병원·의원 | 진료 예약과 접수 문의를 놓치지 않아요. |
| `beauty` | 미용·뷰티 | 시술 예약과 가격 문의를 응대해요. |
| `academy` | 학원·교육 | 상담 예약, 수강 문의, 셔틀 안내까지. |
| `ecommerce` | 쇼핑몰·이커머스 | 배송·교환·환불 문의를 자동으로 접수해요. |
| `real_estate` | 부동산 | 매물 문의를 접수하고 방문 상담을 잡아요. |
| `lodging` | 숙박 | 예약 확인, 체크인 안내, 부대시설 문의 응대. |
| `other` | 기타 | 어떤 업종이든 직접 입력해 시작할 수 있어요. |

- 저장 규칙: `Tenant.industryKey = key`, `Tenant.industryLabel = 프리셋 label`
  (단 `other` 는 직접 입력값을 industryLabel 에 저장). 기존 표시 코드(industryLabel)가
  무수정으로 동작하는 게 목적.
- **070 번호 입력 필드는 없다.** 대신 안내 캡션: "전화번호는 신청이 승인될 때
  콜비가 배정해 드려요."

### 2.3 ③ 요금제 선택

- `TENANT_PLAN_METAS`(`@colli/contracts`) 4장의 카드를 렌더. 기본 선택: `trial`.
  `pro` 카드에 "가장 인기" 뱃지(`recommended: true`).

| plan | 카드 타이틀 | 가격 표기 | 서브카피 | 핵심 항목 |
|---|---|---|---|---|
| `trial` | 무료 체험 | 14일 무료 | 부담 없이 AI 전화 응대를 직접 경험해 보세요. | 14일 전 기능/070 배정/커스텀 전체/통화 기록 |
| `starter` | 스타터 | ₩49,000/월 | 1인 사장님, 작은 매장을 위한 기본 요금제. | 070 1개/커스텀 전체/영업시간·문자/통화 기록 |
| `pro` | 프로 ★가장 인기 | ₩99,000/월 | 전화가 많은 사업장을 위한 표준 요금제. | 스타터 전부/커스텀 연동/호전환·긴급 인계/우선 지원 |
| `enterprise` | 엔터프라이즈 | 문의 | 다지점·프랜차이즈, 맞춤 연동이 필요한 팀. | 프로 전부/다지점(로드맵)/전담 온보딩/맞춤 계약 |

- **결제 연동은 하지 않는다(재확인).** 카드 하단 고정 캡션: "지금은 결제 정보를 받지
  않아요. 요금제는 승인 후 언제든 변경할 수 있어요." 선택값은 `Tenant.plan` 에 저장+표시만.
- 제출 버튼: "신청 완료하기". 로딩 중 "신청 중…" + 비활성화(중복 제출 방지).

### 2.4 제출 → 완료 화면

- 성공: `/pending` 으로 리다이렉트(자동 로그인 상태). §3.1 승인 대기 화면.
- 서버 에러 케이스와 처리:

| 에러 코드 | 상황 | UX |
|---|---|---|
| `email_already_exists` | 이메일 중복 | 1단계로 이동 + 인라인 에러 + 로그인 링크 |
| `invalid_params` | 필드 누락/형식(클라 검증 우회) | 해당 단계로 이동 + 인라인 에러 |
| `internal_error` | 서버 오류 | 토스트: "잠시 후 다시 시도해 주세요" (입력값 유지) |

---

## 3. 승인 플로우 상세

### 3.1 콘솔 — 승인 대기 화면 (`/pending`)

- 진입 규칙: 로그인 세션의 테넌트 `status` 가 `pending_approval` 또는 `rejected` 이면
  콘솔의 **모든** 라우트가 이 화면으로 강제 리다이렉트된다(설정/통화 기록 접근 불가).
  반대로 `active`/`onboarding` 상태가 `/pending` 에 오면 대시보드로 보낸다.
- 화면 구성(승인 대기, `pending_approval`):
  - 일러스트(꿀벌) + 타이틀: **"신청이 접수됐어요"**
  - 본문: "콜비 팀이 사업장 정보를 확인하고 있어요. 보통 **1영업일 안에** 승인되고,
    승인되면 전용 070 번호가 배정돼요. 승인 결과는 가입하신 이메일로도 알려드릴게요."
  - 신청 요약 카드: 사업장 이름 / 업종 라벨 / 요금제(표시 메타) / 신청 시각(`appliedAt`)
  - 상태 뱃지: "승인 대기" (`TENANT_STATUS_LABELS`)
  - 보조: "새로고침" 버튼(상태 재조회), "문의하기" mailto 링크, 로그아웃 버튼.
- 화면 구성(반려, `rejected`):
  - 타이틀: **"신청을 승인하지 못했어요"**
  - 반려 사유 박스: `rejectionReason` 원문 그대로 노출(관리자가 사용자에게 보여줄 문장으로 작성).
  - 본문: "아래 사유를 확인하신 뒤 문의 주시면 다시 도와드릴게요." + 문의하기 링크.
  - (재신청 기능은 v1 범위 밖 — 로드맵 §7. v1 은 문의 유도만.)

### 3.2 관리자(apps/admin) — 승인 큐

- 라우트: `/tenants-admin` 개편 — 상단 탭 또는 필터: **"신청 대기 {N}"** / "전체".
  신청 대기 목록은 `appliedAt` 오름차순(오래된 신청 먼저).
- 목록 컬럼: 사업장 이름 / 업종 라벨 / 요금제 / 연락처(`contactPhone`) / 소유자 이메일 /
  신청 시각 / 액션(승인·반려).
- **승인 모달**: 070 번호 입력 1개 필드(필수, 숫자/하이픈 9~13자리).
  - 캡션: "이 번호로 수신되는 전화를 AI 상담원이 받게 됩니다."
  - 확인 → `POST /admin/tenants/:id/approve` (`ApproveTenantRequest{phoneNumber}`)
  - 성공: status=`active`, `approvedAt` 기록, 목록 갱신 + 토스트 "승인 완료 — 070 배정됨".
  - 에러 `phone_number_taken`(unique 충돌): 모달 내 인라인 "이미 다른 사업장에 배정된 번호예요."
- **반려 모달**: 사유 textarea(필수, 1~500자).
  - 캡션: "이 문구가 신청자에게 그대로 보여집니다. 사용자에게 보내는 문장으로 써 주세요."
  - 확인 → `POST /admin/tenants/:id/reject` (`RejectTenantRequest{reason}`)
  - 성공: status=`rejected`, `rejectionReason`/`rejectedAt` 기록.
- 기존 "테넌트+계정 직접 생성" 기능은 **그대로 유지**(별도 버튼) — 영업이 직접 온보딩하는
  케이스용. 직접 생성은 기존처럼 즉시 `active` + 070 즉시 입력.

### 3.3 상태 기계 & 070 배정 규칙

```
셀프 가입:  (없음) ── POST /signup ──▶ pending_approval ──승인──▶ active
                                            │
                                            └──반려──▶ rejected  (재신청: 로드맵)
관리자 직접 생성:  (없음) ──▶ active   (기존 플로우 그대로)
기존 상태:  onboarding / suspended 는 의미·용법 변경 없음
```

- **070 번호는 승인 시 관리자가 배정한다.** 신청 시점의 `Tenant.phoneNumber` 는
  `makePendingPhoneNumber(slug)` = `"pending-{slug}"` 플레이스홀더(NOT NULL+unique 유지,
  기존 컬럼 변경 금지 원칙). UI 는 `isPhoneNumberAssigned()` 가 false 면 **"미배정"** 으로 표시.
- `GET /tenants/resolve`(voice 라우팅)는 어차피 실수신 번호로만 조회되므로 플레이스홀더와
  충돌하지 않지만, 방어적으로 `status === "active"` 조건을 추가한다(api 워커).
- 승인 전 로그인: 허용(가입 직후 자동 로그인과 동일 세션). 콘솔은 §3.1 대기 화면만 보여준다.

---

## 4. 사업장 커스텀 기능 카탈로그 (전체)

> 각 기능마다 **[설정 항목 → 기본값 → 통화 반영]** 순서로 기술한다.
> "통화 반영"의 프롬프트 합성은 전부 `packages/dialogue` `buildTenantSystemPrompt(ctx)` 확장으로
> 구현하며, **값이 없으면(기본값이면) v2 출력과 100% 동일**해야 한다(골든 패리티 — dialogue 워커).
> 플랫폼 불변 가드레일(결제정보 금지/고지·동의/본인확인)은 어떤 설정으로도 끌 수 없다(기존 원칙).

### 4.1 AI 상담원 프로필 (스튜디오 > 프로필)

| 항목 | 계약 필드 | 기본값 | 검증 |
|---|---|---|---|
| 상담원 이름 | `agentName` | "상담원" (가입 시) | 1~20자 |
| 서비스(사업장) 표시명 | `serviceName` | 사업장 이름 | 1~60자 |
| 첫인사 멘트 | `greetingText` | null → "안녕하세요, {serviceName} 고객센터의 AI 상담원 {agentName}입니다." | ≤200자 |
| 마무리 멘트 **(신규)** | `closingText` | null → 플랫폼 기본 마무리 문구 | ≤200자 |
| 보이스 선택 | — | — | **로드맵(§7)** — UI 에 "준비 중" 잠금 카드로 노출해 기대만 형성 |

**통화 반영:** `greetingText` 는 "# 첫 인사" 섹션(기존 동작). `closingText` 는 "# 마무리"
섹션에 `- 마무리 인사는 다음 문구를 사용합니다: "{closingText}"` 한 줄을 **추가** 렌더
(null 이면 기존 문구 그대로 — 패리티).

**UX:** 폼 우측에 실시간 "통화 미리보기" 패널 — 인사→고지→(예시 문답)→마무리를 말풍선으로
렌더해 저장 전에 확인.

### 4.2 응대 정책 (스튜디오 > 응대 정책)

| 항목 | 계약 필드 | 기본값 | 검증 |
|---|---|---|---|
| 사업장 소개(페르소나) | `personaInstructions` | null | ≤1000자, 자유 서술 |
| 응대 톤 추가 지침 | `toneExtra: string[]` | [] | 항목당 ≤100자, 최대 10개 |
| 업종 특화 금지사항 | `domainConstraints: string[]` | [] | 항목당 ≤200자, 최대 10개 |
| 의도 미파악 폴백 tool | `intentUnresolvedFallbackTool` | "request_callback" | 시스템/커스텀 tool 이름 |
| 의도 파악 최대 시도 | `maxIntentAttempts` | 2 | 1~5 |

**통화 반영:** 기존 v2 와 동일(역할/톤/업종금지 섹션). 플랫폼 기본 톤 규칙(존댓말, 한 번에
하나만 질문, 복창 확인)은 항상 유지되고 `toneExtra` 는 **추가만** 된다.

**UX:** 업종 프리셋(`industryKey`)에 따라 placeholder 예시를 다르게 노출 — 예: 병원·의원이면
금지사항 placeholder "진단·처방 등 의료 조언을 하지 않습니다". (프리셋별 추천 문구는
콘솔 fixture 상수로, 서버 저장 아님.)

### 4.3 영업시간 (운영 설정 > 영업시간) **(신규)**

| 항목 | 계약 필드 | 기본값 | 검증 |
|---|---|---|---|
| 요일별 영업시간 | `businessHours.days` (`Record<DayOfWeek, BusinessDayHours\|null>`) | null(전체 미설정=24시간 응대) | open<close("HH:mm"), close<open 이면 익일 마감(심야 영업) |
| 브레이크타임 | `days[d].breakStart/breakEnd` | 없음 | 영업시간 내 구간 |
| 임시 휴무일 | `businessHours.holidayDates` | [] | "YYYY-MM-DD" |
| 공휴일 휴무 | `businessHours.closedOnPublicHolidays` | false | — |
| 안내 비고 | `businessHours.note` | null | ≤200자 |
| 영업시간 외 응대 방식 | `afterHoursMode` | `"callback"` | `AFTER_HOURS_MODES` |
| 영업시간 외 안내 멘트 | `afterHoursText` | null → mode 별 기본 템플릿 | ≤300자 |

**영업시간 외 응대 방식 2종 (`AFTER_HOURS_MODES`):**
- `callback`(기본) — "지금은 영업시간이 아니에요"를 안내하고 **연락처·용건을 받아 콜백 접수**
  (request_callback). 기본 멘트: "지금은 {업체명} 영업시간이 아닙니다. 성함과 연락처를
  남겨주시면 영업시간에 바로 연락드리겠습니다."
- `announce_hours` — **영업시간만 안내**하고 정중히 종료. 기본 멘트: "지금은 {업체명}
  영업시간이 아닙니다. 영업시간은 {영업시간 요약}입니다. 영업시간에 다시 전화해 주세요."

**통화 반영:**
1. 통화 시작 시 apps/voice(또는 api resolver)가 `isWithinBusinessHours(businessHours, now)`
   (dialogue 워커가 신설하는 순수 함수, Asia/Seoul 고정)를 판정해
   `buildTenantSystemPrompt(ctx)` 의 신규 옵션 `isAfterHours?: boolean` 으로 넘긴다.
2. `businessHours` 가 있으면 "# 영업시간" 섹션이 렌더된다(요일별 요약 + 비고). 영업시간
   문의("몇 시까지 해요?")에 AI 가 정확히 답하는 근거가 된다.
3. `isAfterHours === true` 면 "# 지금은 영업시간 외" 섹션이 최상위 지시로 추가되어
   mode 별 동작(콜백 접수 / 안내 후 종료)을 강제한다. `afterHoursText` 가 있으면 그 멘트 사용.
4. `businessHours` 가 null 이면 위 어떤 섹션도 생성되지 않는다(패리티).

**UX:** 요일 7행 그리드(토글 on/off + 시간 피커), "평일 일괄 적용" 단축 버튼,
우측에 "지금 전화가 오면?" 미리보기(현재 시각 기준 영업 중/외 판정 + 실제 나갈 멘트).

### 4.4 통화 설정 (운영 설정 > 통화) **(신규)**

| 항목 | 계약 필드 | 기본값 | 검증 |
|---|---|---|---|
| 담당자 호전환 번호 | `transferPhoneNumber` | null(호전환 안내 없음) | 숫자/하이픈 9~13자리 |
| 긴급 키워드 | `emergencyKeywords: string[]` | [] | 항목당 1~20자, 최대 20개 |
| 콜백 정책(운영 안내) | (기존 request_callback 흐름) | 콜백 접수 활성 | — |

**통화 반영:**
- `transferPhoneNumber` 설정 시: "# 처리 방법" 섹션에 "사람 연결을 요청하거나 직접 처리가
  필요한 사안이면 escalate_to_human 으로 담당자 연결을 시도합니다" 안내가 강화되고,
  escalate_to_human 실행 시 apps/voice 의 warm transfer 대상 번호로 이 값이 사용된다
  (api 워커: `ResolvedTenantAgentContext.agentConfig` 경유로 전달 — 계약 필드 재사용, voice
  변경은 이번 범위 밖이므로 api 는 값 전달까지만 책임).
- `emergencyKeywords` 비어있지 않으면 "# 긴급 상황 (최우선)" 섹션 렌더:
  "고객 발화에 {키워드 목록} 이 포함되면 다른 어떤 절차보다 먼저 escalate_to_human 으로
  즉시 사람에게 인계합니다. 긴급 상황에서는 의도 파악·본인확인 절차를 생략합니다."
  (본인확인 생략은 조회성 응대가 아닌 인계이므로 GUARDRAIL #4 위반 아님.)
- 두 값 모두 없으면 섹션 미생성(패리티).

**UX:** 긴급 키워드는 칩(chip) 입력. 캡션: "예: 화재, 가스, 응급 — 이 단어가 들리면
안내를 멈추고 바로 담당자에게 연결해요."

### 4.5 문자 안내 설정 (운영 설정 > 문자 안내) **(신규)**

계약: `smsSettings: SmsSettings`(Json). 기본값 `DEFAULT_SMS_SETTINGS`(전부 off — opt-in).

| 항목 | 필드 | on 일 때 동작(v1) |
|---|---|---|
| 접수 확인 문자 | `confirmationEnabled` + `confirmationText` | 문의/티켓 접수 시 발송 대상으로 기록. AI 가 통화에서 "접수 확인 문자를 보내드릴게요"라고 안내 |
| 콜백 예약 안내 문자 | `callbackNoticeEnabled` + `callbackNoticeText` | 콜백 접수 시 동일 |
| 부재중(영업시간 외) 안내 | `missedCallEnabled` + `missedCallText` | 영업시간 외 통화 종료 시 동일 |

- 문구 null → 기본 문구(contracts 주석에 명시된 템플릿). 플레이스홀더 `{업체명}` 지원
  (치환은 발송 시점 애플리케이션 책임).
- **v1 범위:** 설정 저장 + 프롬프트/정책 반영(AI 가 "문자로 안내드릴게요"를 말할지 결정)까지.
  실제 자동 발송 배선은 로드맵(발송 인프라는 기존 `services/notifications` 재사용 —
  `Notification` 테이블/템플릿 구조 그대로).

**통화 반영:** on 인 항목이 하나라도 있으면 "# 마무리" 섹션에 "처리 후 안내 문자가 발송됨을
알립니다" 문구가 조건부로 덧붙는다. 전부 off/null 이면 미생성(패리티).

**UX:** 항목별 토글 + 문구 textarea(기본 문구 placeholder) + 90바이트 카운터(SMS 기준 안내).
상단 안내 배너: "문자 자동 발송은 준비 중이에요. 지금은 설정을 저장해두면 통화 안내에 먼저
반영돼요."

### 4.6 의도 카탈로그 (스튜디오 > 의도) — 기존 기능, 스펙 통합

- 기존 v2 기능 유지: key/label/keywords/routingToolName/sortOrder/enabled CRUD.
- 통화 반영: "# 의도 파악" + "# 처리 방법" 섹션(기존). 기본값: 가입 직후 의도 0개 —
  온보딩 체크리스트에서 "자주 오는 문의 등록"으로 유도(업종 프리셋별 예시 문구 제공).
- 사용자 노출 용어: "의도" 대신 **"문의 유형"** 을 1차 라벨로("예약, 영업시간 문의처럼
  자주 오는 전화 유형을 등록해 주세요").

### 4.7 커스텀 연동 tool (스튜디오 > 연동) — 기존 기능, 스펙 통합

- 기존 v2 기능 유지: name/description/paramsSchema/webhookUrl/secret/timeout CRUD,
  SSRF 검증, HMAC 서명, `custom:{name}` trace 컨벤션.
- 사용자 노출 용어: **"연동"**("우리 예약 시스템을 연결해요"). 기본값: 0개.

### 4.8 지식베이스 KB (스튜디오 > 지식베이스) — 기존 기능, 스펙 통합

- 기존 v2 기능 유지: category/question/answer/tags CRUD → `get_kb_answer`.
- 사용자 노출 용어: **"자주 묻는 질문"**. 기본값: 0개(온보딩 체크리스트 유도).

### 4.9 통화 기록 (콘솔 > 통화 기록) **(신규 화면, 데이터는 기존)**

- 테넌트가 **자기 통화만** 열람: `GET /tenants/:id/calls`(목록, 페이지네이션) /
  `GET /tenants/:id/calls/:callId`(상세) — AuthGuard + 테넌트 스코프(api 워커 신규).
- DTO 는 apps/admin 의 `CallListItem`/`CallDetail` shape 를 테넌트 스코프로 재사용
  (intent 는 자유 문자열로 — 테넌트 의도 key). 목록: 발신번호(마스킹: 010-****-5678),
  시각, 통화 시간, 문의 유형, 결과 뱃지. 상세: 요약, 전사(마스킹된 텍스트), 처리 결과,
  녹음(URL 있으면 플레이어).
- 기본 화면: 빈 상태 일러스트 + "아직 받은 전화가 없어요. 070 번호가 연결되면 여기에
  기록이 쌓여요."

### 4.10 사업장 정보 (운영 설정 > 사업장) **(신규 화면)**

- 표시: 사업장 이름(수정 가능), 업종 라벨, **070 번호(읽기 전용, 미배정 시 "미배정")**,
  요금제 카드(현재 plan 의 `TENANT_PLAN_METAS` 표시 + "요금제 변경은 문의해 주세요" 캡션 —
  결제 미연동), 계정 이메일.

---

## 5. 정보구조(IA) — 콘솔 내비게이션 확정

```
공개:   /            랜딩(리브랜딩)
        /signup      가입 위저드 3단계
        /login       로그인
승인전: /pending     승인 대기·반려 화면 (pending_approval/rejected 강제 랜딩)
콘솔(로그인+active):
  대시보드            /tenants/:id/dashboard      ← 로그인 후 기본 랜딩
  통화 기록           /tenants/:id/calls, /tenants/:id/calls/:callId
  에이전트 스튜디오
    프로필            /tenants/:id/studio/profile      (4.1)
    응대 정책         /tenants/:id/studio/policy       (4.2)
    문의 유형         /tenants/:id/studio/intents      (4.6, 기존 화면 이동)
    연동              /tenants/:id/studio/tools        (4.7, 기존 화면 이동)
    자주 묻는 질문     /tenants/:id/studio/kb           (4.8, 기존 화면 이동)
  운영 설정
    영업시간          /tenants/:id/settings/hours      (4.3)
    통화              /tenants/:id/settings/call       (4.4)
    문자 안내         /tenants/:id/settings/sms        (4.5)
    사업장 정보        /tenants/:id/settings/business   (4.10)
```

- 기존 라우트(`/tenants/:id/settings/{agent,intents,tools,kb}`)는 신규 경로로 **redirect**
  유지(북마크 호환). 기존 "에이전트 설정" 화면은 프로필(4.1)+응대 정책(4.2) 둘로 분리.
- `/onboarding`(목 신청 페이지)은 `/signup` 으로 redirect 하고 페이지는 제거(API 의
  `POST /onboarding` 은 하위호환으로 유지하되 콘솔에서 더 이상 호출하지 않음).
- **대시보드(v1 경량):** 환영 헤더("김윤정님, 콜비가 오늘도 전화를 받고 있어요"),
  070 번호 카드(미배정이면 배정 안내), 설정 체크리스트(인사말/영업시간/문의 유형/FAQ —
  완료 체크), 최근 통화 5건(통화 기록 API 재사용). 통계 차트는 로드맵.
- **사이드바 하단(버그 수정 포함):** 세션이 있으면 **항상** 계정 이메일 + "로그아웃" 노출.
  fixture(데모) 모드면 계정 영역 대신 **"데모 모드"** 뱃지(brand 톤) 표시 — 현재 "fixture 면
  로그아웃/계정을 아예 숨김" 로직이 버그. 데모 모드에서도 세션이 있으면 로그아웃은 노출한다.

관리자(apps/admin) IA 추가: `/tenants-admin` 에 승인 큐(§3.2). 나머지 기존 화면 유지.

---

## 6. 데이터 계약 매핑 (구현 참조)

| 기획 항목 | contracts (`@colli/contracts`) | DB (`schema.prisma`) |
|---|---|---|
| 가입 신청 | `SignupRequest/SignupResult` | `Tenant(status=pending_approval, industryKey, contactPhone, appliedAt, phoneNumber=pending-{slug})` + `AdminAccount(tenant_admin)` + 기본 `TenantAgentConfig` |
| 승인/반려 | `ApproveTenantRequest/RejectTenantRequest/TenantReviewResult` | `Tenant.status/phoneNumber/approvedAt` · `status/rejectionReason/rejectedAt` |
| 업종/요금제 표시 | `INDUSTRY_PRESETS`/`TENANT_PLAN_METAS` | `Tenant.industryKey`/`plan` |
| 상태 라벨 | `TENANT_STATUS_LABELS` | `TenantStatus` enum(+pending_approval/rejected) |
| 070 미배정 판별 | `PENDING_PHONE_PREFIX`/`isPhoneNumberAssigned()`/`makePendingPhoneNumber()` | `Tenant.phoneNumber` 컨벤션 |
| 마무리 멘트 | `TenantAgentConfig.closingText?` | `closingText String?` |
| 영업시간 | `BusinessHours`/`DAYS_OF_WEEK`/`BusinessDayHours` | `businessHours Json?` |
| 영업시간 외 | `AfterHoursMode`/`AFTER_HOURS_MODES`/`afterHoursText?` | `afterHoursMode String @default("callback")`/`afterHoursText String?` |
| 호전환 | `transferPhoneNumber?` | `transferPhoneNumber String?` |
| 긴급 키워드 | `emergencyKeywords?: string[]` | `emergencyKeywords String[] @default([])` |
| 문자 안내 | `SmsSettings`/`DEFAULT_SMS_SETTINGS` | `smsSettings Json?` |

---

## 7. v1 범위 밖 (로드맵 — 화면에 "준비 중"으로만 노출하거나 미노출)

1. **보이스 선택**(상담원 목소리 프리셋) — 프로필 화면에 잠금 카드로 노출.
2. **실제 결제/과금**(PG 연동, 플랜 강제, 사용량 미터링) — 요금제는 저장+표시만.
3. **문자 실발송 자동화** — 설정 저장+프롬프트 반영까지가 v1. 발송 배선은
   services/notifications 재사용으로 후속.
4. **통계 리포트/대시보드 차트**(응대율, 시간대 분포, 문의 유형 분포).
5. **반려 후 재신청 플로우**(신청 정보 수정 후 재제출).
6. **공휴일 자동 판정**(공공 API 연동) — v1 은 closedOnPublicHolidays 안내 문구 반영만.
7. 업종 템플릿 마켓플레이스, 동적 라우팅 DSL, 다지점 운영 — 기존 로드맵(architecture.md §8) 유지.
8. 이메일 알림(승인/반려 통지 메일) — v1 은 화면 내 안내만(문구는 준비됨).

---

## 8. 수용 기준 (전체 재구조화의 Definition of Done)

1. 랜딩 → 가입 위저드 → 신청 완료 → 승인 대기 화면이 브랜드 가이드 적용 상태로 동작.
2. admin 승인 큐에서 070 배정 승인 → 콘솔 재조회 시 대시보드 진입 가능. 반려 → 사유 노출.
3. 신규 설정 4화면(프로필 확장/영업시간/통화/문자)이 저장·재조회되고, 값이 있으면
   `buildTenantSystemPrompt` 출력에 해당 섹션이 나타난다.
4. 신규 설정값이 전부 비어있으면 프롬프트 출력이 v2 와 바이트 동일(골든 패리티 테스트).
5. 통화 기록 목록/상세를 테넌트 스코프로 열람 가능(타 테넌트 403).
6. fixture 모드: 사이드바에 "데모 모드" 뱃지, 세션 있으면 로그아웃 항상 노출.
7. `pnpm -r test` + `pnpm -r typecheck` 전체 그린(기존 277개 + 신규 테스트).
