import { Link, Navigate } from "react-router-dom";
import { INDUSTRY_PRESETS, TENANT_PLANS, TENANT_PLAN_METAS } from "@colli/contracts";
import { useSession } from "../lib/useSession";
import { getCurrentTenantId } from "../api/client";
import { Logo, BeeMark } from "../components/ui";
import { SUPPORT_EMAIL } from "../lib/labels";

/**
 * 콜비(Callbee) 공개 랜딩 — brand-guide §6 의 10개 섹션·카피를 그대로 구현.
 * 배경은 white ↔ ink-50 교차, Display 타입은 히어로 전용(§3.1).
 * 이미 로그인된 세션이 있으면 마케팅 페이지를 건너뛰고 대시보드로 보낸다
 * (데모 모드는 세션이 없으면 랜딩부터 그대로 체험 — 랜딩→가입→대기 데모 플로우).
 */
export function LandingPage() {
  const session = useSession();
  if (session) {
    const tenantId = getCurrentTenantId();
    if (tenantId) return <Navigate to={`/tenants/${tenantId}/dashboard`} replace />;
  }

  return (
    <div className="min-h-screen bg-white text-ink-900">
      {/* 1. 헤더(고정) */}
      <header className="sticky top-0 z-20 border-b border-ink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" aria-label="콜비 홈">
            <Logo />
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
            >
              로그인
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-brand-400 px-4 py-2.5 text-sm font-semibold text-ink-900 hover:bg-brand-500"
            >
              무료로 시작하기
            </Link>
          </nav>
        </div>
      </header>

      {/* 2. 히어로 */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <h1 className="text-[36px] font-extrabold leading-[1.2] tracking-tight sm:text-[44px]">
              사장님이 바쁠 때,
              <br />
              전화는 콜비가 받아요
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-600 lg:mx-0 lg:text-lg">
              예약, 영업시간, 자주 묻는 질문 — 우리 가게 전용 AI 상담원이 070
              번호로 24시간 응대해요. 설정은 10분이면 충분해요.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start sm:justify-center">
              <Link
                to="/signup"
                className="w-full rounded-lg bg-brand-400 px-6 py-3.5 text-center text-base font-semibold text-ink-900 hover:bg-brand-500 sm:w-auto"
              >
                무료로 시작하기
              </Link>
              <Link
                to="/login"
                className="w-full rounded-lg border border-ink-200 bg-white px-6 py-3.5 text-center text-base font-medium text-ink-700 hover:bg-ink-50 sm:w-auto"
              >
                이미 계정이 있어요
              </Link>
            </div>
            <p className="mt-3 text-[13px] text-ink-500">14일 무료 · 카드 등록 없이 시작</p>
          </div>

          {/* 전화 응대 말풍선 목업(예약 대화 3턴) */}
          <div className="mx-auto w-full max-w-md">
            <div className="rounded-xl border border-ink-200 bg-ink-50 p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 border-b border-ink-200 pb-3">
                <BeeMark size={22} />
                <span className="text-sm font-semibold text-ink-800">070-1234-5678</span>
                <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-success-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-success-600" />
                  통화 중
                </span>
              </div>
              <div className="space-y-3">
                <Bubble who="agent">
                  안녕하세요, 라비아 파스타 AI 상담원 콜리예요. 무엇을 도와드릴까요?
                </Bubble>
                <Bubble who="caller">오늘 저녁 7시에 4명 예약할 수 있어요?</Bubble>
                <Bubble who="agent">
                  네, 오늘 저녁 7시에 네 분 예약 도와드릴게요. 예약자 성함과
                  연락처를 말씀해 주시겠어요?
                </Bubble>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. 소셜 프루프 바 — 업종 칩 */}
      <section className="border-y border-ink-100 bg-white py-8">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <p className="text-sm font-medium text-ink-500">
            식당·병원·미용실·학원… 전화가 많은 곳이면 어디든
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {INDUSTRY_PRESETS.map((p) => (
              <span
                key={p.key}
                className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-ink-600"
              >
                {p.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 4. 문제 공감 */}
      <section className="bg-ink-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-xl font-bold sm:text-2xl">
            놓친 전화 한 통이 손님 한 팀이에요
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <PainCard title="피크타임엔 전화 받을 손이 없어요">
              주문과 서빙만으로도 벅찬 시간, 벨소리는 계속 울려요.
            </PainCard>
            <PainCard title="영업시간 문의만 하루 수십 통">
              같은 질문에 매번 하던 일을 멈추고 답해야 해요.
            </PainCard>
            <PainCard title="퇴근 후 걸려온 전화는 그대로 부재중">
              내일 다시 걸어주는 손님은 생각보다 많지 않아요.
            </PainCard>
          </div>
        </div>
      </section>

      {/* 5. 기능 소개(4카드) */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-xl font-bold sm:text-2xl">
            우리 가게에 맞게, 전부 직접 설정해요
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard title="인사말과 말투">
              첫인사부터 마무리까지 우리 가게 말투로.
            </FeatureCard>
            <FeatureCard title="영업시간 응대">
              영업시간엔 예약을 받고, 그 외엔 콜백을 접수해요.
            </FeatureCard>
            <FeatureCard title="담당자 연결">
              급한 전화는 바로 사장님 번호로 돌려드려요.
            </FeatureCard>
            <FeatureCard title="문자 안내">
              접수 확인과 콜백 안내를 문자로 남겨요.
            </FeatureCard>
          </div>
        </div>
      </section>

      {/* 6. 작동 방식(3스텝) */}
      <section className="bg-ink-50 py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-xl font-bold sm:text-2xl">시작은 3분이면 돼요</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            <Step n={1} title="신청">
              가입하고 사업장 정보를 알려주세요
            </Step>
            <Step n={2} title="배정">
              콜비가 확인 후 전용 070 번호를 배정해요
            </Step>
            <Step n={3} title="시작">
              인사말을 정하면 바로 응대를 시작해요
            </Step>
          </ol>
        </div>
      </section>

      {/* 7. 요금제 */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-xl font-bold sm:text-2xl">필요한 만큼만, 투명하게</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TENANT_PLANS.map((plan) => {
              const meta = TENANT_PLAN_METAS[plan];
              return (
                <div
                  key={plan}
                  className={`relative flex flex-col rounded-xl border bg-white p-6 ${
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
                  <p className="mt-2 text-2xl font-bold text-ink-900">{meta.priceLabel}</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
                    {meta.description}
                  </p>
                  <ul className="mt-4 flex-1 space-y-2">
                    {meta.features.map((f) => (
                      <li key={f} className="flex gap-2 text-[13px] text-ink-700">
                        <span aria-hidden="true" className="font-semibold text-brand-600">
                          ✓
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/signup"
                    className={`mt-5 rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${
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
          <p className="mt-6 text-center text-[13px] text-ink-500">
            모든 요금제는 14일 무료 체험으로 시작해요
          </p>
        </div>
      </section>

      {/* 8. 신뢰 섹션 */}
      <section className="bg-ink-50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-xl font-bold sm:text-2xl">안심하고 맡기세요</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <TrustCard title="결제 정보는 전화로 받지 않아요">
              카드번호 같은 민감한 정보는 정책상 차단돼요. 어떤 설정으로도 풀 수
              없어요.
            </TrustCard>
            <TrustCard title="모든 통화는 고지 후 녹음">
              녹음 고지를 먼저 안내하고, 통화 내용은 기록으로 언제든 확인할 수
              있어요.
            </TrustCard>
            <TrustCard title="AI가 못 하는 일은 사람에게">
              애매하거나 급한 문의는 바로 담당자 연결이나 콜백 접수로 넘겨요.
            </TrustCard>
          </div>
        </div>
      </section>

      {/* 9. 마지막 CTA 밴드 */}
      <section className="bg-brand-50 py-16">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-xl font-bold sm:text-2xl">다음 전화부터, 콜비가 받을게요</h2>
          <Link
            to="/signup"
            className="mt-6 inline-block rounded-lg bg-brand-400 px-8 py-3.5 text-base font-semibold text-ink-900 hover:bg-brand-500"
          >
            무료로 시작하기
          </Link>
        </div>
      </section>

      {/* 10. 푸터 */}
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

function Bubble({ who, children }: { who: "agent" | "caller"; children: string }) {
  if (who === "agent") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-xl rounded-tl-sm bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-800 shadow-sm">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-brand-400 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-900">
        {children}
      </div>
    </div>
  );
}

function TrustCard({ title, children }: { title: string; children: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-success-50 text-success-600">
        <span aria-hidden="true" className="text-base font-bold">
          ✓
        </span>
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{children}</p>
    </div>
  );
}

function PainCard({ title, children }: { title: string; children: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-6">
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{children}</p>
    </div>
  );
}

function FeatureCard({ title, children }: { title: string; children: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <span aria-hidden="true" className="text-base font-bold">
          ✓
        </span>
      </div>
      <h3 className="mt-4 text-base font-semibold text-ink-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{children}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: string }) {
  return (
    <li className="text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-400 text-sm font-bold text-ink-900">
        {n}
      </div>
      <h3 className="mt-3 text-base font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-600">{children}</p>
    </li>
  );
}
