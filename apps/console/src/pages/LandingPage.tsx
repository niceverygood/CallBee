import { Link, Navigate } from "react-router-dom";
import { useSession } from "../lib/useSession";
import { getCurrentTenantId, IS_FIXTURE } from "../api/client";

/**
 * 콜비(Colli) 공개 랜딩 페이지 — 로그인 불필요.
 * 총괄관리자(apps/admin)는 운영자 본인만 쓰므로 노출하지 않는다. 여기서는
 * 오직 "가입하는 사업장(테넌트 관리자)"을 위한 진입점(로그인/가입)만 안내한다.
 * 이미 로그인된 세션이 있으면(또는 fixture 개발 모드면) 마케팅 페이지를 건너뛰고
 * 바로 대시보드로 보낸다.
 */
export function LandingPage() {
  const session = useSession();
  if (IS_FIXTURE || session) {
    const tenantId = getCurrentTenantId();
    if (tenantId) return <Navigate to={`/tenants/${tenantId}/settings/agent`} replace />;
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-lg font-bold text-slate-900">콜비 Colli</span>
        <nav className="flex items-center gap-3">
          <Link
            to="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            로그인
          </Link>
          <Link
            to="/onboarding"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            무료로 시작하기
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-20 pt-16 text-center">
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
          우리 업장 전용 AI 상담원을
          <br />
          직접 만들어 070으로 받으세요
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          콜비는 식당, 병원, 매장 등 어떤 업종이든 전화 응대를 맡길 AI 상담원을
          코드 없이 직접 설정하는 플랫폼입니다. 인사말·상담 톤·자주 묻는 질문·
          업무별 연동까지 전부 우리 대시보드에서 관리합니다.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            to="/onboarding"
            className="rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white hover:bg-brand-700"
          >
            무료로 시작하기
          </Link>
          <Link
            to="/login"
            className="rounded-lg border border-slate-300 px-6 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50"
          >
            이미 계정이 있어요
          </Link>
        </div>
      </section>

      <section className="border-t border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-bold text-slate-900">
            무엇을 직접 설정할 수 있나요
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              title="에이전트 인사말·톤"
              desc="상담원 이름과 첫인사, 말투, 업종별 응대 원칙을 직접 입력합니다."
            />
            <FeatureCard
              title="의도 분류 카탈로그"
              desc="예약·메뉴 문의·불만접수 등 우리 업종에 맞는 문의 유형을 자유롭게 정의합니다."
            />
            <FeatureCard
              title="커스텀 tool 연동"
              desc="예약 확인, 재고 조회 같은 우리 시스템 기능을 webhook 하나로 AI에게 연결합니다."
            />
            <FeatureCard
              title="지식베이스(FAQ)"
              desc="자주 묻는 질문과 답변을 등록해두면 AI가 그대로 답변합니다."
            />
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-2xl font-bold text-slate-900">
            시작하는 방법
          </h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            <Step n={1} title="가입 신청" desc="업체명·업종·070 번호를 신청하면 테넌트가 생성됩니다." />
            <Step n={2} title="에이전트 설정" desc="대시보드에서 인사말·의도·tool·FAQ를 채웁니다." />
            <Step n={3} title="바로 응대 시작" desc="070으로 걸려오는 전화를 AI 상담원이 바로 받습니다." />
          </ol>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} 콜비 Colli
      </footer>
    </div>
  );
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{desc}</p>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <li className="text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
        {n}
      </div>
      <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{desc}</p>
    </li>
  );
}
