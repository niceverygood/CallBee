# Implement 워커 브리핑 v3 — 셀프 가입·승인 + 사업장 커스텀 + 리브랜딩

> **단일 소스:** `@colli/contracts`(**v0.4.0**, 빌드 통과 확인됨) + `@colli/db` schema.prisma
> (validate 통과, **migrate 는 api 워커 책임**). 기획: `/docs/product-spec.md`(§ 번호 인용),
> 브랜드: `/docs/brand-guide.md`. 기존 277개 테스트는 이 계약 변경 후에도 전부 통과 상태다.
> 유일한 알려진 typecheck 실패: `apps/admin/src/pages/TenantsAdminPage.tsx:18,24`
> (TenantStatus 확장으로 라벨 맵 키 2개 부족 — admin 워커가 최우선 수정).
>
> 공통 규칙: 응답 봉투 `{ok:true,data}|{ok:false,error:{code,message}}` 유지. 기존
> export/라우트 삭제 금지. 사용자 노출 문구는 brand-guide §5 용어 사전 준수(예: "사업장",
> "문의 유형", "데모 모드").

---

## Worker API — `apps/api` (+ `packages/db` migrate/seed)

**신뢰(입력):** `SignupRequest/SignupResult/ApproveTenantRequest/RejectTenantRequest/
TenantReviewResult`(auth.ts), `TENANT_STATUSES`(+pending_approval/rejected),
`INDUSTRY_PRESETS`/`findIndustryPreset`, `TENANT_PLANS`, `makePendingPhoneNumber`/
`isPhoneNumberAssigned`, `TenantAgentConfig` 신규 optional 필드 7종(closingText/
businessHours/afterHoursMode/afterHoursText/transferPhoneNumber/emergencyKeywords/
smsSettings), `DEFAULT_SMS_SETTINGS`. 기존 AuthGuard/@RequireRole/테넌트 스코프 패턴.

**구현 범위:**
1. **Prisma migrate 실행(이 워커의 단독 책임):** `pnpm --filter @colli/db exec prisma
   migrate dev --name signup_approval_and_agent_custom` — 신규 컬럼은 전부 nullable/기본값
   이라 단일 마이그레이션으로 안전(기존 행 무손상). 적용 후 `prisma generate`, BoBi 시드
   영향 없음(신규 필드 전부 optional).
2. **`POST /signup` (공개, 무인증)** — 신규 `signup.controller.ts`:
   - 검증(product-spec §2 규칙): email 형식/소문자 정규화, password ≥8자,
     businessName 1~60자, industryKey ∈ INDUSTRY_PRESETS(other 면 industryCustomLabel 필수),
     contactPhone 숫자/하이픈 9~13자리, plan ∈ TENANT_PLANS. 실패 → `invalid_params`.
   - 이메일 중복 → `email_already_exists`.
   - 트랜잭션(auth.controller.ts 의 runInTransaction 패턴 재사용): ① Tenant 생성
     `{slug: slugify(businessName), name, industryKey, industryLabel: 프리셋 label 또는
     직접입력값, phoneNumber: makePendingPhoneNumber(slug), status:"pending_approval",
     plan, ownerEmail: email, contactPhone, appliedAt: now}` ② 기본 TenantAgentConfig
     (기존 onboarding.controller 값과 동일: serviceName=businessName, agentName="상담원")
     ③ AdminAccount(tenant_admin). 응답: `SignupResult{tenantId, account, tenantStatus:
     "pending_approval", token: signToken(...)}` (자동 로그인).
3. **승인/반려 (platform_admin 전용):**
   - `POST /admin/tenants/:id/approve` body `ApproveTenantRequest{phoneNumber}` —
     검증: 대상 status=`pending_approval`(아니면 `invalid_state`), 번호 형식, unique 충돌 시
     `phone_number_taken`. 성공: status=`active`, phoneNumber=실번호, approvedAt=now.
     응답 `TenantReviewResult`.
   - `POST /admin/tenants/:id/reject` body `RejectTenantRequest{reason}` — reason 1~500자
     필수. 성공: status=`rejected`, rejectionReason/rejectedAt 기록.
   - `GET /admin/tenants` 응답에 신규 optional 필드(industryKey/contactPhone/appliedAt/
     approvedAt/rejectedAt/rejectionReason) 포함되도록 adapter(tenant-prisma.ts,
     인메모리) 확장 — TenantSummary 의 optional 필드라 non-breaking.
4. **테넌트 통화 기록 GET:** `GET /tenants/:id/calls?limit&offset` /
   `GET /tenants/:id/calls/:callId` — AuthGuard+assertTenantScope, CallSession 을
   tenantId 스코프로 조회. DTO 는 apps/admin `CallListItem`/`CallDetail` shape 를 따르되
   `intent: string|null`(테넌트 자유 key). 상세는 Transcript(마스킹된 텍스트)+
   ToolInvocation toolName 목록 포함. 정렬 startedAt desc.
5. **agent-config 라우트 확장:** `PUT /tenants/:id/agent-config` body 에 신규 7필드 허용
   (Omit<TenantAgentConfig,"tenantId"> 이미 커버 — repo/adapter 가 신규 컬럼을 읽고 쓰도록
   확장). businessHours/smsSettings 는 Json 직렬화, afterHoursMode 는 AFTER_HOURS_MODES
   검증, transferPhoneNumber/contactPhone 형식 검증. `GET /tenants/resolve` 의
   ResolvedTenantAgentContext.agentConfig 에 신규 필드가 실려 나가야 함(voice 가 소비).
6. **resolve 방어:** `GET /tenants/resolve` 는 `status === "active"` 테넌트만 매칭.

**파일 경로:** `apps/api/src/signup.controller.ts`(신규), `auth.controller.ts`(승인/반려 추가
또는 `admin-review.controller.ts` 신규), `tenants.controller.ts`(calls GET), `tenant.ports.ts`/
`adapters/tenant-prisma.ts`/인메모리 adapter(신규 필드), `apps/api/src/__tests__/*`(신규 테스트:
signup 검증 매트릭스/승인/반려/상태 가드/calls 스코프 403).

**완료 기준:** ① migrate 적용+`prisma validate` ② signup→pending_approval→approve(070 배정)
→active 가 테스트로 재현 ③ reject 사유 저장·노출 ④ calls 목록/상세 테넌트 격리(타 테넌트
403) ⑤ 기존 98개 api 테스트 무수정 통과.
**검증:** `cd /Users/seungsoohan/Projects/CallBee && pnpm --filter @colli/db exec prisma validate
&& pnpm --filter api test && pnpm -r typecheck`

---

## Worker Console — `apps/console` (리브랜딩 + 가입 위저드 + 신규 화면)

**신뢰(입력):** api 워커의 위 엔드포인트(피처 플래그로 병행 개발 가능 — fixture 모드 우선
구현), `INDUSTRY_PRESETS`/`TENANT_PLAN_METAS`/`TENANT_STATUS_LABELS`/`AFTER_HOURS_MODES`/
`DAY_OF_WEEK_LABELS`/`DEFAULT_SMS_SETTINGS`/`isPhoneNumberAssigned`, `SignupRequest/
SignupResult`. 브랜드 토큰/컴포넌트 규칙: brand-guide §2~5 전체.

**구현 범위:**
1. **브랜드 가이드 전면 적용:** tailwind.config 를 brand-guide §2.4 토큰으로 교체(brand
   파랑→허니, ink/semantic 추가), `slate-*` → `ink-*` 전 화면 치환, index.html 에 Pretendard
   Variable CDN link + index.css font-family(§3), 버튼/입력/카드/뱃지/테이블을 §4 규칙으로
   재스킨(공용 컴포넌트 Button/Input/Card/Badge 추출 권장). Primary 버튼 = brand-400 배경
   + **ink-900 텍스트**(흰 텍스트 금지).
2. **랜딩 재작업(`/`):** brand-guide §6 의 10개 섹션·카피 그대로 구현. 요금제 카드는
   `TENANT_PLAN_METAS` 데이터 소스 사용.
3. **가입 위저드(`/signup`):** product-spec §2 — 3단계 스텝퍼, 단계별 필드/검증/에러 문구
   표 그대로, 업종 프리셋 카드(INDUSTRY_PRESETS), 요금제 카드(TENANT_PLAN_METAS,
   recommended 뱃지), 제출 `POST /signup` → 성공 시 SignupResult.token 으로 loginSession()
   → `/pending`. 에러 매핑(§2.4 표). fixture 모드는 목 성공 응답.
4. **승인 대기/반려 화면(`/pending`):** product-spec §3.1 — status 가
   pending_approval/rejected 인 세션은 모든 콘솔 라우트에서 여기로 강제 리다이렉트
   (RequireAuth 확장), active 는 대시보드로. 문구는 스펙 원문 사용. rejectionReason 노출.
   새로고침(재조회)/로그아웃 포함.
5. **IA 재편(product-spec §5):** 대시보드(`/tenants/:id/dashboard` — 환영 헤더, 070 카드
   (`isPhoneNumberAssigned` false 면 "미배정"), 설정 체크리스트, 최근 통화 5건), 사이드바
   그룹(대시보드/통화 기록/에이전트 스튜디오/운영 설정), 기존 4화면 경로 이동+redirect,
   `/onboarding` → `/signup` redirect.
6. **신규 설정 화면 4종(product-spec §4.1~4.5, 각 항목·기본값·검증 표 그대로):**
   프로필(agentName/serviceName/greetingText/closingText + 보이스 "준비 중" 잠금 카드 +
   통화 미리보기 패널), 영업시간(요일 그리드+휴무일+afterHoursMode 라디오+afterHoursText,
   "지금 전화가 오면?" 미리보기), 통화(transferPhoneNumber, emergencyKeywords 칩 입력),
   문자 안내(SmsSettings 토글 3쌍+문구+"자동 발송 준비 중" 배너). 저장은 전부
   `PUT /tenants/:id/agent-config`(부분 아님 — 전체 draft 병합 후 PUT, 기존 패턴 유지).
7. **통화 기록 화면:** `/tenants/:id/calls`(목록: 마스킹 발신번호/시각/시간/문의 유형/결과
   뱃지) + `/calls/:callId`(요약/전사/처리 결과/녹음). 빈 상태 문구는 스펙 §4.9. fixture
   데이터 추가.
8. **버그 수정(AppShell.tsx):** 세션이 있으면 **항상** 계정 이메일+로그아웃 렌더(fixture
   여부와 무관). fixture 모드는 "FIXTURE 모드/LIVE API" 뱃지 대신 **"데모 모드"** 뱃지
   (`bg-brand-100 text-brand-800`)로 교체, 라이브 모드는 뱃지 없음. 현재 코드의
   `!IS_FIXTURE && session` / `!IS_FIXTURE` 조건이 버그 원인.

**파일 경로:** `tailwind.config.js`, `index.html`, `src/index.css`, `src/App.tsx`(라우팅),
`src/components/*`(AppShell 수정+공용 컴포넌트), `src/pages/{LandingPage,SignupWizardPage,
PendingApprovalPage,DashboardPage,CallsPage,CallDetailPage,ProfilePage,PolicyPage,
BusinessHoursPage,CallSettingsPage,SmsSettingsPage,BusinessInfoPage}.tsx`,
`src/api/{types,fixtures,hooks,client}.ts`(signup/calls/pending 훅+fixture).

**완료 기준:** ① 전 화면 새 토큰(파랑/slate 잔존 0) ② 랜딩→가입→대기→(fixture 승인 목)→
대시보드 플로우 동작 ③ 신규 설정 4화면 저장·재조회 ④ 데모 모드 뱃지+로그아웃 상시 노출
⑤ 기존 5개+신규 화면 테스트 통과.
**검증:** `cd /Users/seungsoohan/Projects/CallBee && pnpm --filter console test && pnpm --filter
console build && pnpm -r typecheck`

---

## Worker Admin — `apps/admin` (승인 큐)

**신뢰(입력):** `ApproveTenantRequest/RejectTenantRequest/TenantReviewResult`,
TenantSummary 신규 optional 필드, `TENANT_STATUS_LABELS`, `INDUSTRY_PRESETS`(라벨 표시),
`TENANT_PLAN_METAS`, `isPhoneNumberAssigned`. api 워커의 approve/reject 엔드포인트.

**구현 범위:**
1. **(최우선, typecheck 복구)** `src/pages/TenantsAdminPage.tsx:18,24` 의
   `STATUS_LABELS`/`STATUS_TONE` Record 에 `pending_approval`("승인 대기", warn 톤)/
   `rejected`("반려됨", danger 톤) 키 추가 — 현재 이 2곳 때문에 `pnpm -r typecheck` 실패 중.
   가능하면 자체 라벨 맵을 `TENANT_STATUS_LABELS` 재사용으로 교체.
2. **승인 큐(product-spec §3.2):** `/tenants-admin` 에 "신청 대기 {N}"/"전체" 필터(대기
   목록은 appliedAt asc). 컬럼: 사업장/업종 라벨/요금제/연락처/이메일/신청 시각/액션.
   070 미배정은 "미배정" 표시.
3. **승인 모달:** 070 번호 입력(필수, 숫자/하이픈 9~13자리) + 캡션(스펙 원문) →
   `POST /admin/tenants/:id/approve`. `phone_number_taken` 인라인 에러. 성공 토스트
   "승인 완료 — 070 배정됨".
4. **반려 모달:** 사유 textarea(1~500자 필수) + 캡션 "이 문구가 신청자에게 그대로
   보여집니다…" → `POST /admin/tenants/:id/reject`.
5. 기존 "테넌트+계정 직접 생성" 기능은 그대로 유지(버튼/모달 무변경).
6. (선택) brand-guide 토큰을 admin tailwind 에도 이식 — 콘솔만큼 전면 재스킨은 요구하지
   않으나 상태 뱃지 색은 §4.4 조합을 따른다.

**파일 경로:** `src/pages/TenantsAdminPage.tsx`, `src/api/{types,hooks,fixtures}.ts`
(approve/reject 훅+fixture), 테스트 `src/pages/TenantsAdminPage.test.tsx`(승인/반려/검증).

**완료 기준:** ① typecheck 그린 복구 ② 대기 목록→승인(070 입력)→active 반영 ③ 반려→사유
저장 ④ 직접 생성 회귀 없음.
**검증:** `cd /Users/seungsoohan/Projects/CallBee && pnpm --filter admin test && pnpm -r typecheck`

---

## Worker Dialogue — `packages/dialogue` (신규 필드 프롬프트 반영)

**신뢰(입력):** `TenantAgentConfig` 신규 optional 필드 7종, `BusinessHours`/`DayOfWeek`/
`DAY_OF_WEEK_LABELS`/`BusinessDayHours`, `AfterHoursMode`, `SmsSettings`. 기존
`buildTenantSystemPrompt`/`buildSystemPrompt` 구조(공유 섹션 헬퍼, GUARDRAIL 헬퍼는
설정 인자 없음).

**구현 범위 (전부 `system-prompt.ts` 확장 + 신규 `business-hours.ts`):**
1. **골든 패리티 절대 조건:** 신규 필드가 전부 undefined/null/[]/기본값이면
   `buildTenantSystemPrompt` 출력은 현재와 **바이트 동일**. 기존
   `system-prompt.tenant-parity.test.ts`/`system-prompt.test.ts` 무수정 통과.
   `buildSystemPrompt`(BoBi 전용)는 한 글자도 변경 금지.
2. **TenantSystemPromptContext 확장:** `isAfterHours?: boolean` 옵션 추가(판정은 호출자
   책임 — voice/api). 미지정 시 false.
3. **섹션 반영(product-spec §4 의 "통화 반영" 명세 그대로, 렌더 순서):**
   - `closingText` → "# 마무리" 섹션에 `- 마무리 인사는 다음 문구를 사용합니다: "…"` 줄 추가.
   - `businessHours` 존재 시 "# 영업시간" 섹션(감정 대응 섹션 앞): 요일별 요약(휴무 요일
     명시, DAY_OF_WEEK_LABELS 사용), 브레이크타임, note. + "영업시간 문의에는 이 정보로
     정확히 답합니다."
   - `businessHours && isAfterHours` → 역할 섹션 다음, 최상위 지시로 "# 지금은 영업시간 외"
     섹션: mode=`callback` 이면 콜백 접수 지시(afterHoursText ?? 기본 템플릿, request_callback
     사용), mode=`announce_hours` 면 영업시간 안내 후 정중히 종료 지시.
   - `emergencyKeywords.length > 0` → "# 긴급 상황 (최우선)" 섹션(톤 섹션 앞): 키워드 나열 +
     "감지 즉시 escalate_to_human 으로 인계, 의도 파악·본인확인 생략".
   - `transferPhoneNumber` 존재 시 "# 처리 방법" 섹션에 "담당자 연결이 필요하면
     escalate_to_human 으로 연결을 시도합니다(담당자 직통 연결 가능)" 줄 추가. 전화번호
     원문은 프롬프트에 넣지 않는다(AI 가 번호를 발화하는 사고 방지 — 실제 전환은 voice 가
     agentConfig.transferPhoneNumber 로 수행).
   - `smsSettings` 에 enabled 항목이 하나라도 있으면 "# 마무리"에 "처리 후 안내 문자가
     발송됨을 알립니다" 줄 추가.
4. **`business-hours.ts` 신설:** `isWithinBusinessHours(hours: BusinessHours, now: Date):
   boolean` 순수 함수 — Asia/Seoul 고정, close<open 은 익일 마감(심야 영업), breakStart/End
   구간은 영업 외, holidayDates 는 휴무. + `summarizeBusinessHours(hours): string`(프롬프트/
   UI 공용 요약 문자열). index.ts 에서 export.
5. **테스트(신규 파일):** 패리티(빈 값 → 기존 스냅샷 동일), 각 필드 단독 설정 시 해당
   섹션 toContain, GUARDRAIL 3종 문구가 모든 조합에서 항상 포함, business-hours 경계
   케이스(자정 걸침/브레이크/휴무일/요일 경계).

**파일 경로:** `src/system-prompt.ts`, `src/business-hours.ts`(신규), `src/index.ts`,
`src/system-prompt.custom-fields.test.ts`(신규), `src/business-hours.test.ts`(신규).

**완료 기준:** ① 기존 79개 테스트 무수정 통과 ② 빈 값 바이트 패리티 테스트 ③ 필드별 섹션
렌더 테스트 ④ GUARDRAIL 문구 불변 검증.
**검증:** `cd /Users/seungsoohan/Projects/CallBee && pnpm --filter @colli/dialogue test && pnpm -r test`

---

## 통합 순서 (권장)

1. **dialogue**(계약만 의존, 즉시 착수 가능) + **api**(migrate 먼저) 병행.
2. **admin**(typecheck 복구는 즉시, 승인 큐는 api 완료 후 배선 — fixture 로 병행 가능).
3. **console**(리브랜딩·위저드는 fixture 로 즉시, 라이브 배선은 api 완료 후).
4. 통합 검증: `pnpm -r test && pnpm -r typecheck` 그린 + product-spec §8 수용 기준 체크.
