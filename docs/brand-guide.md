# 콜비(Callbee) 브랜드 가이드 v1

> **버전:** v1 (2026-07) · **적용 범위:** apps/console(전면), apps/admin(토큰만 공유), 랜딩, 문서.
> 이 가이드의 토큰/규칙은 console 워커가 tailwind config 와 전 화면에 그대로 적용한다.
> 제품 스펙은 `/docs/product-spec.md` 참조.

---

## 1. 브랜드 스토리

**콜비(Callbee)는 사장님 대신 부지런히 전화를 받는 일벌이다.**

꿀벌은 작지만 성실하다. 쉬지 않고 날아다니며 꿀을 모으고, 벌집(사업장)을 지킨다.
콜비는 사장님이 주방에서, 진료실에서, 매장에서 일하는 동안 걸려오는 전화를 한 통도
놓치지 않고 대신 받는다. 전화(Call) + 꿀벌(Bee) = **Callbee**.

브랜드가 전달해야 할 세 가지 감각:
1. **신뢰** — 내 가게 전화를 맡겨도 사고 안 치겠다는 안심. (절제된 색, 정돈된 타이포)
2. **성실** — 24시간 부지런히 일하는 일벌의 근면함. (허니 앰버 포인트, 활기 있는 카피)
3. **간결** — 사장님이 10분 만에 설정을 끝내는 쉬움. (토스/노션 결의 미니멀 UI)

**메타포 사용 규칙:** 꿀벌 모티프는 로고·일러스트·빈 상태(empty state)·로딩에만 절제해서
사용한다. 본문 UI 에 벌집 패턴·꿀 방울 장식을 깔지 않는다(촌스러움 방지). 육각형은
아이콘 배지 정도로만 허용.

### 1.1 네이밍 표기 규칙

| 맥락 | 표기 |
|---|---|
| 한글 문장 내 | **콜비** ("콜비가 전화를 받는 동안…") |
| 영문/로고/저장소 | **Callbee** (첫 글자만 대문자. CallBee, CALLBEE, callbee 금지 — 단 저장소명 CallBee, 패키지 스코프 @colli 는 기술 자산이므로 예외) |
| 병기 | 콜비(Callbee) — 첫 등장 시 1회만 병기 |
| AI 상담원 지칭 | "AI 상담원" (콜비 자체를 상담원 이름처럼 쓰지 않는다 — 상담원 이름은 사장님이 직접 짓는 커스텀 값) |
| 금지 | "Colli" 는 사용자 노출 문구에서 퇴출(코드 내부 스코프명 @colli 만 잔존 허용) |

---

## 2. 컬러 팔레트

**설계 판단:** 꿀벌 메타포의 허니 앰버를 포인트 컬러로 쓰되, 화면의 90%는 잉크(웜 그레이
뉴트럴)로 채우는 "절제된 프리미엄" 전략(토스가 파랑을 쓰는 방식과 동일). 앰버 원색을
대면적으로 깔지 않는다. **앰버 배경 버튼 위 텍스트는 항상 잉크(ink-900)** — 흰 텍스트는
대비 미달로 금지(꿀벌의 노랑+검정 대비를 그대로 브랜드 자산화).

### 2.1 Primary — Honey (brand)

tailwind 토큰명: `brand-50` ~ `brand-900`

| 토큰 | hex | 용도 |
|---|---|---|
| `brand-50` | `#FFF9EB` | 선택 배경, 하이라이트 행 |
| `brand-100` | `#FFEFC7` | 뱃지 배경, hover 배경 |
| `brand-200` | `#FFE08A` | 보조 장식, 프로그레스 트랙 |
| `brand-300` | `#FFCD4D` | 일러스트 보조 |
| `brand-400` | `#FFB820` | **Primary 버튼 배경**(텍스트는 ink-900) |
| `brand-500` | `#F5A302` | Primary 버튼 hover, 브랜드 아이콘 |
| `brand-600` | `#D18608` | 링크/강조 텍스트(흰 배경 위, AA 충족 지점) |
| `brand-700` | `#A8660B` | 진한 강조 텍스트, active 상태 |
| `brand-800` | `#854F0E` | 뱃지 텍스트(brand-100 배경 위) |
| `brand-900` | `#6B3F10` | 일러스트 라인, 최암부 |

### 2.2 Neutral — Ink (본문·배경·보더의 기본)

tailwind 토큰명: `ink-50` ~ `ink-900` (웜 그레이 — 순수 무채색보다 아주 살짝 따뜻하게)

| 토큰 | hex | 용도 |
|---|---|---|
| `ink-50` | `#F9FAFB` | 페이지 배경 |
| `ink-100` | `#F2F4F6` | 카드 안 서브 배경, hover |
| `ink-200` | `#E5E8EB` | 보더 기본 |
| `ink-300` | `#D1D6DB` | 비활성 보더, 구분선 진하게 |
| `ink-400` | `#B0B8C1` | placeholder, 비활성 아이콘 |
| `ink-500` | `#8B95A1` | 캡션, 보조 텍스트 |
| `ink-600` | `#6B7684` | 서브 텍스트 |
| `ink-700` | `#4E5968` | 본문 텍스트 |
| `ink-800` | `#333D4B` | 강조 본문, 서브 헤딩 |
| `ink-900` | `#191F28` | 헤딩, Primary 버튼 텍스트, 로고 텍스트 |

### 2.3 Semantic

| 토큰 | hex | 용도 |
|---|---|---|
| `success-50` / `success-600` / `success-700` | `#ECFDF5` / `#059669` / `#047857` | 승인·운영 중·저장 완료 |
| `warn-50` / `warn-600` / `warn-700` | `#FFFBEB` / `#D97706` / `#B45309` | 승인 대기·주의(브랜드 앰버와 구분: warn 은 항상 아이콘 동반) |
| `danger-50` / `danger-600` / `danger-700` | `#FEF2F2` / `#DC2626` / `#B91C1C` | 반려·삭제·에러 |
| `info-50` / `info-600` | `#EFF6FF` / `#2563EB` | 안내 배너(중립 정보) |

### 2.4 tailwind.config 토큰 정의 (console 워커가 그대로 적용)

```js
// apps/console/tailwind.config.js  theme.extend.colors
colors: {
  brand: { 50:"#FFF9EB",100:"#FFEFC7",200:"#FFE08A",300:"#FFCD4D",400:"#FFB820",
           500:"#F5A302",600:"#D18608",700:"#A8660B",800:"#854F0E",900:"#6B3F10" },
  ink:   { 50:"#F9FAFB",100:"#F2F4F6",200:"#E5E8EB",300:"#D1D6DB",400:"#B0B8C1",
           500:"#8B95A1",600:"#6B7684",700:"#4E5968",800:"#333D4B",900:"#191F28" },
  success:{ 50:"#ECFDF5",600:"#059669",700:"#047857" },
  warn:   { 50:"#FFFBEB",600:"#D97706",700:"#B45309" },
  danger: { 50:"#FEF2F2",600:"#DC2626",700:"#B91C1C" },
  info:   { 50:"#EFF6FF",600:"#2563EB" },
}
```

- 기존 `brand-{50,100,500,600,700}`(파랑) 토큰은 **위 값으로 교체**된다 — 기존 클래스명이
  그대로 새 팔레트를 입는 구조라 마이그레이션 비용이 낮다. 단 `slate-*` 사용처는 전부
  `ink-*` 로 치환한다(console 워커).
- 사용 비율 가이드: 화면당 ink 90% / brand 8% / semantic 2%. Primary 버튼은 화면당
  1개 원칙.

---

## 3. 타이포그래피

**서체: Pretendard Variable** (한글 최적화, 토스·당근 계열 프로덕트 표준감).

```html
<!-- apps/console/index.html <head> -->
<link rel="stylesheet" as="style" crossorigin
  href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
```

```css
/* index.css */
:root { font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont,
        "Apple SD Gothic Neo", "Segoe UI", sans-serif; }
```

### 3.1 타입 스케일 (tailwind 유틸 기준)

| 레벨 | 크기/행간 | 굵기 | tailwind | 용도 |
|---|---|---|---|---|
| Display | 44px/1.2 | 800 | `text-[44px] font-extrabold tracking-tight` | 랜딩 히어로 전용 |
| H1 | 28px/1.3 | 700 | `text-[28px] font-bold` | 페이지 타이틀 |
| H2 | 20px/1.4 | 700 | `text-xl font-bold` | 섹션 타이틀, 카드 헤더 |
| H3 | 16px/1.5 | 600 | `text-base font-semibold` | 필드 그룹, 리스트 헤더 |
| Body | 15px/1.6 | 400 | `text-[15px]` | 본문 기본 |
| Body-s | 14px/1.6 | 400 | `text-sm` | 테이블, 폼 입력 |
| Caption | 13px/1.5 | 400~500 | `text-[13px] text-ink-500` | 힌트, 메타 정보 |
| Label | 13px/1.4 | 600 | `text-[13px] font-semibold text-ink-700` | 폼 라벨, 뱃지 |

**굵기 규칙:** 800은 랜딩 Display 전용. 콘솔 안에서는 700(헤딩)/600(라벨·강조)/400(본문)
3단만 쓴다. 색으로 위계를 만들 수 있으면 굵기를 올리지 않는다.

---

## 4. 컴포넌트 원칙

공통 기하: **radius 는 3단** — 입력·버튼 `rounded-lg`(8px), 카드·모달 `rounded-xl`(12px),
뱃지·칩 `rounded-full`. 그림자는 2단 — 카드 `shadow-sm`, 모달/팝오버
`shadow-lg`. 그 외 그림자 금지(플랫 우선). 포커스는 전부
`focus:ring-2 ring-brand-400 ring-offset-1`.

### 4.1 버튼

| 종류 | 스타일 | 상태 |
|---|---|---|
| Primary | `bg-brand-400 text-ink-900 font-semibold rounded-lg px-4 py-2.5` | hover `bg-brand-500` · active `bg-brand-600 text-white 금지 — brand-600 배경엔 ink-900 유지` · disabled `opacity-40 cursor-not-allowed` |
| Secondary | `border border-ink-200 bg-white text-ink-700 font-medium` | hover `bg-ink-50` |
| Ghost | `text-ink-600 font-medium` | hover `bg-ink-100 text-ink-900` |
| Danger | `bg-danger-600 text-white font-semibold` | hover `bg-danger-700` · 파괴적 액션 확인 모달 필수 |

- 로딩: 스피너 + 라벨 유지("저장 중…"), 버튼 폭 고정(레이아웃 점프 금지).
- 한 화면(뷰포트)에 Primary 1개 원칙. 나란히 배치 시 Primary 오른쪽.

### 4.2 입력(Input/Textarea/Select)

- `rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900
  placeholder:text-ink-400`
- hover `border-ink-300` · focus `border-brand-400 ring-2 ring-brand-100` ·
  disabled `bg-ink-100 text-ink-400` · error `border-danger-600 ring-danger-50`
- 라벨은 입력 위(Label 스타일), 힌트/에러는 아래 Caption. 에러 문구는 danger-600,
  아이콘 없이 텍스트만(간결).

### 4.3 카드

- `rounded-xl border border-ink-200 bg-white p-6` (+ 목록 카드엔 `shadow-sm` 선택).
- 카드 헤더: H2 + 우측 액션. 카드 간 간격 `gap-4`(16px)~`gap-6`(24px).
- 선택형 카드(업종/요금제): 기본 `border-ink-200`, hover `border-ink-300`,
  선택 `border-brand-500 ring-2 ring-brand-100 bg-brand-50/50` + 우상단 체크.

### 4.4 뱃지(상태)

`rounded-full px-2.5 py-0.5 text-xs font-semibold` — 배경 50 + 텍스트 700 조합 고정:

| 상태 | 조합 |
|---|---|
| 운영 중(active) | `bg-success-50 text-success-700` |
| 승인 대기(pending_approval) | `bg-warn-50 text-warn-700` |
| 반려됨(rejected) | `bg-danger-50 text-danger-700` |
| 설정 중(onboarding) | `bg-info-50 text-info-600` |
| 일시 정지(suspended) | `bg-ink-100 text-ink-600` |
| 데모 모드 | `bg-brand-100 text-brand-800` |

### 4.5 테이블

- 헤더: `text-[13px] font-semibold text-ink-500 uppercase 없음(한글) border-b border-ink-200`.
- 행: `py-3.5 text-sm text-ink-700 border-b border-ink-100`, hover `bg-ink-50`,
  클릭 가능 행은 커서+행 전체 링크.
- 빈 상태: 꿀벌 일러스트(또는 이모지 수준의 절제) + 1줄 설명 + 보조 CTA.

### 4.6 스페이싱·레이아웃

- 기본 그리드 4px. 페이지 패딩 `p-8`(콘솔)/`px-6`(모바일). 섹션 간 `space-y-8`.
- 콘솔 본문 최대폭 `max-w-3xl`(폼 화면)/`max-w-5xl`(테이블 화면). 사이드바 `w-64`.
- 사이드바: `bg-white border-r border-ink-200`, 활성 항목 `bg-brand-50 text-brand-800
  font-semibold`, 비활성 `text-ink-600 hover:bg-ink-50`.

---

## 5. 보이스 & 톤 (UI 문구 원칙)

1. **존댓말 해요체.** "저장되었습니다" 대신 "저장했어요". 시스템 오류만 합쇼체 허용.
2. **한 문장 한 정보.** 버튼 ≤6자 지향("신청 완료하기" OK), 토스트 ≤40자.
3. **전문용어 금지 — 사용자 노출 용어 사전 (강제):**

| 내부 코드 용어(유지) | 사용자 노출 용어 |
|---|---|
| tenant / 테넌트 | **사업장** |
| intent / 의도 | **문의 유형** |
| custom tool / webhook | **연동** |
| KB / 지식베이스 | **자주 묻는 질문** |
| agent config | **AI 상담원 설정** |
| fixture 모드 | **데모 모드** |
| pending_approval | **승인 대기** |
| transfer / escalation | **담당자 연결** |
| plan | **요금제** |

4. **불안 대신 안내.** 에러는 "안 돼요"가 아니라 다음 행동 제시: "이미 가입된 이메일이에요.
   로그인해 주세요."
5. **약속은 구체적으로.** "곧 승인됩니다" 금지 → "보통 1영업일 안에 승인돼요".
6. 느낌표는 온보딩 축하 순간에만 1회("승인됐어요! 이제 전화를 받을 준비를 해볼까요").
   이모지는 UI 문구에 사용하지 않는다(빈 상태 일러스트로 대체).

---

## 6. 랜딩 페이지 구성안 (`/`)

섹션 순서와 실제 카피 초안. Display/H2 스케일과 §2 팔레트 적용, 배경은 white ↔ ink-50 교차.

1. **헤더(고정):** 좌측 로고(꿀벌 마크 + "콜비" ink-900 볼드), 우측 "로그인"(Ghost) +
   "무료로 시작하기"(Primary).
2. **히어로:** (배경 white, 중앙 정렬)
   - Display: **"사장님이 바쁠 때, 전화는 콜비가 받아요"**
   - 서브(Body-l, ink-600): "예약, 영업시간, 자주 묻는 질문 — 우리 가게 전용 AI 상담원이
     070 번호로 24시간 응대해요. 설정은 10분이면 충분해요."
   - CTA: "무료로 시작하기"(Primary-lg) + "이미 계정이 있어요"(Secondary). CTA 아래 캡션:
     "14일 무료 · 카드 등록 없이 시작"
   - 우측(또는 하단) 비주얼: 전화 응대 말풍선 목업(AI 상담원이 예약을 받는 대화 3턴).
3. **소셜 프루프 바(선택):** "식당·병원·미용실·학원… 전화가 많은 곳이면 어디든" (업종
   프리셋 8종 라벨을 칩으로 나열 — 데이터가 없으니 고객 로고 대신 업종 칩).
4. **문제 공감:** (ink-50 배경) H2 "놓친 전화 한 통이 손님 한 팀이에요" + 3카드:
   "피크타임엔 전화 받을 손이 없어요" / "영업시간 문의만 하루 수십 통" / "퇴근 후 걸려온
   전화는 그대로 부재중".
5. **기능 소개(4카드):** H2 "우리 가게에 맞게, 전부 직접 설정해요"
   - **인사말과 말투** — "첫인사부터 마무리까지 우리 가게 말투로."
   - **영업시간 응대** — "영업시간엔 예약을 받고, 그 외엔 콜백을 접수해요."
   - **담당자 연결** — "급한 전화는 바로 사장님 번호로 돌려드려요."
   - **문자 안내** — "접수 확인과 콜백 안내를 문자로 남겨요."
6. **작동 방식(3스텝):** H2 "시작은 3분이면 돼요" — ① "가입하고 사업장 정보를 알려주세요"
   ② "콜비가 확인 후 전용 070 번호를 배정해요" ③ "인사말을 정하면 바로 응대를 시작해요".
7. **요금제:** H2 "필요한 만큼만, 투명하게" — `TENANT_PLAN_METAS` 4카드(§product-spec 2.3
   과 동일 데이터 소스). 캡션 "모든 요금제는 14일 무료 체험으로 시작해요".
8. **신뢰 섹션:** H2 "안심하고 맡기세요" — 3항목: "결제 정보는 전화로 받지 않아요(정책상
   차단)" / "모든 통화는 고지 후 녹음, 기록으로 확인" / "AI가 못 하는 일은 사람에게
   바로 연결".
9. **마지막 CTA 밴드:** (brand-50 배경) H2 "다음 전화부터, 콜비가 받을게요" + Primary CTA.
10. **푸터:** 로고, ⓒ 콜비(Callbee), 문의 메일.

---

## 7. 로고·일러스트 방향 (v1 실무 지침)

- v1 로고는 텍스트 로고: "콜비" 또는 "Callbee" (Pretendard 800, ink-900) + 좌측에 단순
  꿀벌 마크(원 2개+날개, brand-400/ink-900 2색 — SVG 인라인, 외부 에셋 의존 금지).
- 파비콘: 육각형(brand-400) 안에 흰 수화기 실루엣.
- 일러스트는 빈 상태/승인 대기/404 3곳만. 2색(brand + ink) 라인 스타일로 통일.
