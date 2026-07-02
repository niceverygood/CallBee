import { Link, Navigate } from "react-router-dom";
import { INDUSTRY_PRESETS, TENANT_PLANS, TENANT_PLAN_METAS } from "@colli/contracts";
import { useSession } from "../lib/useSession";
import { getCurrentTenantId } from "../api/client";
import { Logo, BeeMark } from "../components/ui";
import { SUPPORT_EMAIL } from "../lib/labels";
import callbeeMascotUrl from "../assets/callbee-mascot.webp";

const heroMetrics = [
  { label: "먼저 안내", value: "AI+녹음" },
  { label: "확인 후 조회", value: "전화번호" },
  { label: "끝나면 정리", value: "문자·요약" },
];

const workflowSteps = [
  {
    title: "전화 수신",
    body: "전용 070 번호로 들어온 전화를 콜비가 먼저 받아요.",
  },
  {
    title: "본인 확인",
    body: "필요한 조회는 가입 전화번호 확인 후에만 진행해요.",
  },
  {
    title: "문의 처리",
    body: "예약, 자주 묻는 질문, 티켓 접수, 담당자 연결을 정책대로 실행해요.",
  },
  {
    title: "후속 알림",
    body: "통화 요약과 접수 결과를 문자 또는 알림톡으로 남겨요.",
  },
];

const featureCards = [
  {
    title: "우리 말투 그대로",
    body: "첫인사, 상담 톤, 금지 표현을 화면에서 바로 조정해요.",
    tone: "brand",
  },
  {
    title: "문의 유형 자동 분류",
    body: "예약, 환불, 운영시간, 상담 요청을 한눈에 볼 수 있게 정리해요.",
    tone: "info",
  },
  {
    title: "사람 인계 기준",
    body: "AI가 판단하면 안 되는 문의는 담당자 연결이나 콜백으로 넘겨요.",
    tone: "success",
  },
  {
    title: "통화 trace 기록",
    body: "고지, 동의, tool 호출, 실패 사유를 통화별로 확인해요.",
    tone: "ink",
  },
];

const trustItems = [
  {
    title: "AI 응대와 녹음 고지",
    body: "통화 초입에 안내하고 동의 로그를 남겨요.",
  },
  {
    title: "결제 정보 음성 수집 금지",
    body: "카드번호, CVC, 계좌 정보는 셀프서비스 링크로만 안내해요.",
  },
  {
    title: "상태 변경은 tool로만",
    body: "티켓 생성, 조회, 알림 발송은 추적 가능한 함수 호출로 실행해요.",
  },
];

const transcript = [
  { who: "agent", text: "안녕하세요, 콜비예요. AI 응대와 녹음을 먼저 안내드렸어요." },
  { who: "caller", text: "오늘 예약 가능 시간 확인하고 싶어요." },
  { who: "agent", text: "가입 전화번호 확인 후 가능한 시간을 찾아드릴게요." },
];

export function LandingPage() {
  const session = useSession();
  if (session) {
    const tenantId = getCurrentTenantId();
    if (tenantId) return <Navigate to={`/tenants/${tenantId}/dashboard`} replace />;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-ink-900">
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5 sm:px-6">
          <Link to="/" aria-label="콜비 홈">
            <Logo />
          </Link>
          <nav className="flex shrink-0 items-center gap-1.5">
            <Link
              to="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 sm:inline-flex"
            >
              로그인
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-brand-400 px-3 py-2.5 text-sm font-semibold text-ink-900 shadow-sm transition hover:bg-brand-500 sm:px-4"
            >
              <span className="sm:hidden">시작하기</span>
              <span className="hidden sm:inline">무료로 시작하기</span>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden border-b border-brand-100 bg-brand-50">
          <img
            src={callbeeMascotUrl}
            alt="헤드셋을 낀 콜비 bee 캐릭터"
            className="pointer-events-none absolute -right-40 top-[390px] -z-10 w-[430px] opacity-15 sm:-right-14 sm:top-4 sm:w-[500px] sm:opacity-35 lg:bottom-0 lg:right-0 lg:top-auto lg:z-0 lg:w-[min(42vw,600px)] lg:opacity-100 xl:right-[calc((100vw-72rem)/2-1.5rem)]"
          />
          <div className="relative z-10 mx-auto flex min-h-[calc(100svh-7rem)] w-full max-w-6xl flex-col justify-center px-6 py-10 sm:py-14 lg:py-16">
            <div className="min-w-0 max-w-2xl">
              <p className="inline-flex rounded-full border border-brand-200 bg-white/90 px-3 py-1 text-[13px] font-semibold text-brand-800 shadow-sm">
                AI 전화 응대 플랫폼
              </p>
              <h1 className="mt-5 text-[42px] font-extrabold leading-[1.05] sm:text-[58px] lg:text-[72px]">
                콜비
              </h1>
              <p className="mt-5 max-w-lg text-[17px] leading-8 text-ink-700 sm:max-w-xl sm:text-[19px]">
                작고 부지런한 AI 전화 담당자가 전화를 받고, 확인하고, 기록해요.
                놓친 전화는 줄이고 중요한 문의는 사람에게 정확히 넘겨요.
              </p>
              <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Link
                  to="/signup"
                  className="inline-flex w-full justify-center rounded-lg bg-brand-400 px-6 py-3.5 text-base font-semibold text-ink-900 shadow-sm transition hover:bg-brand-500 sm:w-auto"
                >
                  무료로 시작하기
                </Link>
                <Link
                  to="/login"
                  className="inline-flex w-full justify-center rounded-lg border border-ink-200 bg-white/95 px-6 py-3.5 text-base font-medium text-ink-700 shadow-sm transition hover:bg-white sm:w-auto"
                >
                  이미 계정이 있어요
                </Link>
              </div>
              <p className="mt-3 text-[13px] font-medium text-ink-500">
                14일 무료 · 카드 등록 없음 · 10분 설정
              </p>
              <div className="mt-7 hidden max-w-xl grid-cols-3 gap-2 sm:grid">
                {heroMetrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-xl border border-white/80 bg-white/85 px-3 py-3 shadow-sm backdrop-blur"
                  >
                    <p className="text-[12px] font-semibold text-ink-500">{metric.label}</p>
                    <p className="mt-1 text-sm font-bold text-ink-900">{metric.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 w-full max-w-sm rounded-xl border border-brand-100 bg-white/95 p-3 shadow-sm sm:p-4">
              <div className="flex items-center gap-2 border-b border-brand-100 pb-3">
                <BeeMark size={22} />
                <span className="text-sm font-semibold text-ink-800">070 상담 연결 중</span>
                <span className="ml-auto rounded-full bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700">
                  live
                </span>
              </div>
              <div className="mt-3 space-y-2.5">
                {transcript.map((line) => (
                  <Bubble key={line.text} who={line.who as "agent" | "caller"}>
                    {line.text}
                  </Bubble>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-ink-100 bg-white py-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-ink-600">
              식당, 병원, 학원, 이커머스까지 전화가 많은 팀을 위해 만들었어요.
            </p>
            <div className="flex flex-wrap gap-2">
              {INDUSTRY_PRESETS.slice(0, 6).map((preset) => (
                <span
                  key={preset.key}
                  className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-[13px] font-semibold text-brand-800"
                >
                  {preset.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-ink-50 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHeader
              eyebrow="Call flow"
              title="전화 한 통이 끝날 때까지 흐름이 보여요"
              body="콜비는 상담을 자유롭게 지어내지 않고, 정해진 정책과 tool 호출을 따라 움직여요."
            />
            <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {workflowSteps.map((step, index) => (
                <li key={step.title} className="rounded-xl border border-ink-100 bg-white p-5 shadow-sm">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-ink-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-600">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHeader
              eyebrow="Studio"
              title="설정은 단순하게, 운영은 전문적으로"
              body="운영자가 매일 확인해야 하는 것만 남기고 복잡한 기술 설정은 뒤로 숨겼어요."
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {featureCards.map((feature) => (
                <FeatureCard key={feature.title} title={feature.title} tone={feature.tone}>
                  {feature.body}
                </FeatureCard>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-ink-900 py-16 text-white sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <p className="text-[13px] font-semibold text-brand-300">Guardrails</p>
              <h2 className="mt-3 text-[28px] font-bold leading-tight sm:text-[34px]">
                고객 응대에서 중요한 선을 지켜요
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-ink-300">
                AI 상담은 친절함만큼 통제가 중요해요. 콜비는 고지, 동의, 본인 확인,
                결제 정보 차단을 기본 정책으로 둡니다.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {trustItems.map((item) => (
                <TrustCard key={item.title} title={item.title}>
                  {item.body}
                </TrustCard>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHeader
              eyebrow="Plans"
              title="필요한 만큼만 시작해요"
              body="14일 무료 체험으로 먼저 통화 흐름을 확인하고, 맞는 요금제를 선택하세요."
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {TENANT_PLANS.map((plan) => {
                const meta = TENANT_PLAN_METAS[plan];
                return (
                  <div
                    key={plan}
                    className={`relative flex min-h-[360px] flex-col rounded-xl border bg-white p-6 shadow-sm ${
                      meta.recommended
                        ? "border-brand-500 ring-2 ring-brand-100"
                        : "border-ink-200"
                    }`}
                  >
                    {meta.recommended ? (
                      <span className="absolute -top-3 left-5 rounded-full bg-brand-400 px-2.5 py-0.5 text-xs font-semibold text-ink-900">
                        가장 인기
                      </span>
                    ) : null}
                    <h3 className="text-base font-semibold text-ink-900">{meta.name}</h3>
                    <p className="mt-3 text-2xl font-bold text-ink-900">{meta.priceLabel}</p>
                    <p className="mt-3 text-[13px] leading-6 text-ink-500">{meta.description}</p>
                    <ul className="mt-5 flex-1 space-y-2.5">
                      {meta.features.map((feature) => (
                        <li key={feature} className="flex gap-2 text-[13px] leading-5 text-ink-700">
                          <span aria-hidden="true" className="mt-0.5 text-brand-600">
                            ✓
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      to="/signup"
                      className={`mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition ${
                        meta.recommended
                          ? "bg-brand-400 text-ink-900 hover:bg-brand-500"
                          : "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                      }`}
                    >
                      시작하기
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-brand-50 py-14">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 sm:flex-row sm:items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[13px] font-semibold text-brand-800">
                <BeeMark size={18} />
                Ready
              </p>
              <h2 className="mt-2 text-2xl font-bold text-ink-900">
                다음 전화부터, 콜비가 받을게요
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                카드 등록 없이 시작하고, 우리 사업장에 맞는 상담 흐름을 바로 만들어 보세요.
              </p>
            </div>
            <Link
              to="/signup"
              className="inline-flex rounded-lg bg-ink-900 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-ink-800"
            >
              무료로 시작하기
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-100 bg-white py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 text-center">
          <Logo />
          <p className="text-[13px] text-ink-500">
            ⓒ {new Date().getFullYear()} 콜비(Callbee) ·{" "}
            <a className="text-brand-600 hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
              문의하기
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-[13px] font-semibold text-brand-700">{eyebrow}</p>
      <h2 className="mt-3 text-[28px] font-bold leading-tight text-ink-900 sm:text-[34px]">
        {title}
      </h2>
      <p className="mt-4 text-[15px] leading-7 text-ink-600">{body}</p>
    </div>
  );
}

function Bubble({ who, children }: { who: "agent" | "caller"; children: string }) {
  const isAgent = who === "agent";
  return (
    <div className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-5 sm:px-3.5 sm:py-2.5 sm:leading-6 ${
          isAgent
            ? "rounded-tl-md bg-brand-50 text-ink-800"
            : "rounded-tr-md bg-brand-400 text-ink-900 shadow-sm"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function FeatureCard({
  title,
  tone,
  children,
}: {
  title: string;
  tone: string;
  children: string;
}) {
  const toneClass =
    tone === "brand"
      ? "bg-brand-100 text-brand-800"
      : tone === "info"
        ? "bg-info-50 text-info-600"
        : tone === "success"
          ? "bg-success-50 text-success-700"
          : "bg-ink-100 text-ink-700";

  return (
    <div className="rounded-xl border border-ink-100 bg-white p-6 shadow-sm transition hover:border-brand-100 hover:bg-brand-50/40">
      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${toneClass}`}>
        <span aria-hidden="true" className="text-base font-bold">
          ✓
        </span>
      </div>
      <h3 className="mt-5 text-base font-semibold text-ink-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-ink-600">{children}</p>
    </div>
  );
}

function TrustCard({ title, children }: { title: string; children: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-300 text-sm font-bold text-ink-900">
        ✓
      </div>
      <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-ink-300">{children}</p>
    </div>
  );
}
