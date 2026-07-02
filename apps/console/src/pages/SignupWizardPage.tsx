import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import type { SignupRequest, TenantPlan } from "@colli/contracts";
import { INDUSTRY_PRESETS, TENANT_PLANS, TENANT_PLAN_METAS } from "@colli/contracts";
import { useSignup } from "../api/hooks";
import { apiErrorCode } from "../api/client";
import { loginSession } from "../lib/session";
import { useSession } from "../lib/useSession";
import { FormField, inputCls, inputErrorCls } from "../components/FormField";
import { Logo, btnPrimary, btnSecondary } from "../components/ui";
import callbeeMascotUrl from "../assets/callbee-mascot.webp";

/**
 * 가입 위저드 3단계 — product-spec §2.
 * ① 계정 만들기 → ② 사업장 정보 → ③ 요금제 선택. 이전 단계로 자유롭게
 * 되돌아갈 수 있고 입력값은 유지된다(제출은 3단계에서 한 번만).
 * 성공 시 SignupResult.token 으로 자동 로그인 → /pending 승인 대기 화면.
 */

const STEPS = ["계정 만들기", "사업장 정보", "요금제 선택"] as const;

interface WizardDraft {
  email: string;
  password: string;
  passwordConfirm: string;
  businessName: string;
  industryKey: string | null;
  industryCustomLabel: string;
  contactPhone: string;
  plan: TenantPlan;
}

const emptyDraft = (): WizardDraft => ({
  email: "",
  password: "",
  passwordConfirm: "",
  businessName: "",
  industryKey: null,
  industryCustomLabel: "",
  contactPhone: "",
  plan: "trial",
});

// ── 검증 규칙(product-spec §2.1~2.3 표 그대로) ───────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d-]{9,13}$/;

type FieldErrors = Partial<Record<keyof WizardDraft, string>>;

function validateStep1(d: WizardDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!EMAIL_RE.test(d.email.trim().toLowerCase()))
    errors.email = "이메일 형식을 확인해 주세요";
  if (d.password.length < 8 || /\s/.test(d.password))
    errors.password = "비밀번호는 8자 이상이어야 해요";
  if (d.password !== d.passwordConfirm)
    errors.passwordConfirm = "비밀번호가 서로 달라요";
  return errors;
}

function validateStep2(d: WizardDraft): FieldErrors {
  const errors: FieldErrors = {};
  const name = d.businessName.trim();
  if (name.length < 1 || name.length > 60)
    errors.businessName = "사업장 이름을 입력해 주세요";
  if (!d.industryKey) errors.industryKey = "업종을 선택해 주세요";
  if (d.industryKey === "other") {
    const custom = d.industryCustomLabel.trim();
    if (custom.length < 1 || custom.length > 30)
      errors.industryCustomLabel = "업종을 입력해 주세요";
  }
  if (!PHONE_RE.test(d.contactPhone.trim()) || d.contactPhone.replace(/-/g, "").length < 9)
    errors.contactPhone = "연락처 형식을 확인해 주세요";
  return errors;
}

export function SignupWizardPage() {
  const navigate = useNavigate();
  const session = useSession();
  const signup = useSignup();

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<WizardDraft>(emptyDraft());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [emailTaken, setEmailTaken] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // 이미 로그인된 상태면 위저드 대신 콘솔로(RequireAuth/pending 이 상태별 분기).
  if (session && !signup.isPending && !signup.isSuccess) {
    return <Navigate to="/" replace />;
  }

  const set = (partial: Partial<WizardDraft>) => {
    setDraft((d) => ({ ...d, ...partial }));
    setServerError(null);
  };

  const goNext = () => {
    const validate = step === 0 ? validateStep1 : validateStep2;
    const nextErrors = validate(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) {
      setStep((s) => Math.min(s + 1, 2));
    }
  };

  const goBack = () => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  };

  const submit = () => {
    const all = { ...validateStep1(draft), ...validateStep2(draft) };
    if (Object.keys(all).length > 0) {
      setErrors(all);
      setStep(Object.keys(validateStep1(draft)).length > 0 ? 0 : 1);
      return;
    }
    setServerError(null);
    const req: SignupRequest = {
      email: draft.email.trim().toLowerCase(),
      password: draft.password,
      businessName: draft.businessName.trim(),
      industryKey: draft.industryKey!,
      ...(draft.industryKey === "other"
        ? { industryCustomLabel: draft.industryCustomLabel.trim() }
        : {}),
      contactPhone: draft.contactPhone.trim(),
      plan: draft.plan,
    };
    signup.mutate(req, {
      onSuccess: (res) => {
        loginSession({ token: res.token, account: res.account });
        navigate("/pending", { replace: true });
      },
      onError: (err) => {
        const code = apiErrorCode(err);
        if (code === "email_already_exists") {
          setEmailTaken(true);
          setErrors({ email: "이미 가입된 이메일이에요. 로그인해 주세요." });
          setStep(0);
          return;
        }
        if (code === "invalid_params") {
          setServerError("입력 내용을 다시 확인해 주세요.");
          setStep(0);
          return;
        }
        setServerError("잠시 후 다시 시도해 주세요");
      },
    });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-brand-50 pb-16 text-ink-900">
      <header className="border-b border-brand-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" aria-label="콜비 홈">
            <Logo />
          </Link>
          <Link
            to="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-50 hover:text-ink-900"
          >
            로그인
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 pt-8 lg:grid-cols-[1fr_320px] lg:items-start">
        <div>
          <div className="mb-6 rounded-xl border border-brand-100 bg-white/80 px-5 py-4 shadow-sm">
            <p className="text-[13px] font-semibold text-brand-800">가입은 3단계면 끝나요</p>
            <h1 className="mt-1 text-2xl font-bold text-ink-900">콜비 시작하기</h1>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              계정과 사업장 정보를 알려주시면 전용 전화 응대 흐름을 준비해 드려요.
            </p>
          </div>

          <ol
            className="mb-6 flex items-center justify-center gap-2 rounded-xl border border-brand-100 bg-white/80 px-3 py-3 shadow-sm sm:gap-4"
            aria-label="가입 단계"
          >
            {STEPS.map((label, i) => (
              <li key={label} className="flex items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${
                      i < step
                        ? "bg-brand-400 text-ink-900"
                        : i === step
                          ? "bg-brand-100 text-brand-800 ring-2 ring-brand-200"
                          : "bg-ink-100 text-ink-500"
                    }`}
                  >
                    {i < step ? "✓" : i + 1}
                  </span>
                  <span
                    className={`hidden text-[13px] sm:inline ${
                      i === step ? "font-semibold text-ink-900" : "font-medium text-ink-500"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 ? (
                  <span aria-hidden="true" className="h-px w-4 bg-brand-100 sm:w-10" />
                ) : null}
              </li>
            ))}
          </ol>

          <div className="rounded-xl border border-brand-100 bg-white p-6 shadow-sm sm:p-8">
            {step === 0 ? (
              <StepAccount
                draft={draft}
                errors={errors}
                emailTaken={emailTaken}
                set={set}
                onNext={goNext}
              />
            ) : null}
            {step === 1 ? (
              <StepBusiness
                draft={draft}
                errors={errors}
                set={set}
                onNext={goNext}
                onBack={goBack}
              />
            ) : null}
            {step === 2 ? (
              <StepPlan
                draft={draft}
                set={set}
                onBack={goBack}
                onSubmit={submit}
                submitting={signup.isPending}
                serverError={serverError}
              />
            ) : null}
          </div>
        </div>

        <aside className="hidden overflow-hidden rounded-xl border border-brand-100 bg-white/80 p-5 shadow-sm lg:block">
          <div className="mx-auto aspect-square max-w-[220px]">
            <img
              src={callbeeMascotUrl}
              alt="가입을 안내하는 콜비 캐릭터"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="mt-4 rounded-xl bg-brand-50 px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">070 번호는 승인 후 배정돼요</p>
            <p className="mt-1 text-[13px] leading-6 text-ink-600">
              지금은 결제 정보 없이 신청만 받고, 승인되면 콜비가 받을 전화번호와 기본 응대
              설정을 준비해요.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

// ── ① 계정 만들기 ────────────────────────────────────────────────
function StepAccount({
  draft,
  errors,
  emailTaken,
  set,
  onNext,
}: {
  draft: WizardDraft;
  errors: FieldErrors;
  emailTaken: boolean;
  set: (p: Partial<WizardDraft>) => void;
  onNext: () => void;
}) {
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
      className="space-y-4"
    >
      <div>
        <h2 className="text-xl font-bold text-ink-900">계정을 만들어 주세요</h2>
        <p className="mt-1 text-sm text-ink-500">콘솔에 로그인할 때 사용할 계정이에요.</p>
      </div>

      <FormField label="이메일" error={errors.email}>
        <input
          type="email"
          autoFocus
          className={errors.email ? inputErrorCls : inputCls}
          value={draft.email}
          onChange={(e) => set({ email: e.target.value })}
          placeholder="owner@example.com"
        />
        {emailTaken && errors.email ? (
          <p className="mt-1.5 text-[13px] font-normal">
            <Link to="/login" className="font-semibold text-brand-600 hover:underline">
              로그인하기
            </Link>
          </p>
        ) : null}
      </FormField>

      <FormField label="비밀번호" hint="8자 이상, 공백 없이 입력해 주세요." error={errors.password}>
        <input
          type="password"
          className={errors.password ? inputErrorCls : inputCls}
          value={draft.password}
          onChange={(e) => set({ password: e.target.value })}
          placeholder="••••••••"
        />
      </FormField>

      <FormField label="비밀번호 확인" error={errors.passwordConfirm}>
        <input
          type="password"
          className={errors.passwordConfirm ? inputErrorCls : inputCls}
          value={draft.passwordConfirm}
          onChange={(e) => set({ passwordConfirm: e.target.value })}
          placeholder="••••••••"
        />
      </FormField>

      <div className="flex items-center justify-between pt-2">
        <p className="text-[13px] text-ink-500">
          이미 계정이 있으신가요?{" "}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">
            로그인
          </Link>
        </p>
        <button type="submit" className={btnPrimary}>
          다음
        </button>
      </div>
    </form>
  );
}

// ── ② 사업장 정보 ────────────────────────────────────────────────
function StepBusiness({
  draft,
  errors,
  set,
  onNext,
  onBack,
}: {
  draft: WizardDraft;
  errors: FieldErrors;
  set: (p: Partial<WizardDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
      className="space-y-4"
    >
      <div>
        <h2 className="text-xl font-bold text-ink-900">사업장을 알려주세요</h2>
        <p className="mt-1 text-sm text-ink-500">
          업종에 맞춰 AI 상담원의 기본 응대를 준비해 드려요.
        </p>
      </div>

      <FormField label="사업장 이름" error={errors.businessName}>
        <input
          autoFocus
          className={errors.businessName ? inputErrorCls : inputCls}
          value={draft.businessName}
          maxLength={60}
          onChange={(e) => set({ businessName: e.target.value })}
          placeholder="예: 라비아 파스타"
        />
      </FormField>

      <div>
        <span className="block text-[13px] font-semibold text-ink-700">업종</span>
        <div className="mt-1.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {INDUSTRY_PRESETS.map((p) => {
            const selected = draft.industryKey === p.key;
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={selected}
                onClick={() => set({ industryKey: p.key })}
                className={`relative rounded-xl border p-3.5 text-left transition-colors ${
                  selected
                    ? "border-brand-500 bg-brand-50/50 ring-2 ring-brand-100"
                    : "border-ink-200 bg-white hover:border-ink-300"
                }`}
              >
                {selected ? (
                  <span className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-400 text-[10px] font-bold text-ink-900">
                    ✓
                  </span>
                ) : null}
                <span className="block text-sm font-semibold text-ink-900">{p.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-500">
                  {p.description}
                </span>
              </button>
            );
          })}
        </div>
        {errors.industryKey ? (
          <p className="mt-1.5 text-[13px] text-danger-600">{errors.industryKey}</p>
        ) : null}
      </div>

      {draft.industryKey === "other" ? (
        <FormField label="업종 직접 입력" error={errors.industryCustomLabel}>
          <input
            className={errors.industryCustomLabel ? inputErrorCls : inputCls}
            value={draft.industryCustomLabel}
            maxLength={30}
            onChange={(e) => set({ industryCustomLabel: e.target.value })}
            placeholder="예: 반려동물 미용"
          />
        </FormField>
      ) : null}

      <FormField
        label="사업장 연락처"
        hint="승인 심사와 연락에 사용해요. 070 번호는 신청이 승인될 때 콜비가 배정해 드려요."
        error={errors.contactPhone}
      >
        <input
          type="tel"
          className={errors.contactPhone ? inputErrorCls : inputCls}
          value={draft.contactPhone}
          maxLength={13}
          onChange={(e) => set({ contactPhone: e.target.value })}
          placeholder="02-1234-5678"
        />
      </FormField>

      <div className="flex items-center justify-between pt-2">
        <button type="button" onClick={onBack} className={btnSecondary}>
          이전
        </button>
        <button type="submit" className={btnPrimary}>
          다음
        </button>
      </div>
    </form>
  );
}

// ── ③ 요금제 선택 ────────────────────────────────────────────────
function StepPlan({
  draft,
  set,
  onBack,
  onSubmit,
  submitting,
  serverError,
}: {
  draft: WizardDraft;
  set: (p: Partial<WizardDraft>) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  serverError: string | null;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-ink-900">요금제를 골라주세요</h2>
        <p className="mt-1 text-sm text-ink-500">
          어떤 요금제든 14일 무료 체험으로 시작해요.
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {TENANT_PLANS.map((plan) => {
          const meta = TENANT_PLAN_METAS[plan];
          const selected = draft.plan === plan;
          return (
            <button
              key={plan}
              type="button"
              aria-pressed={selected}
              onClick={() => set({ plan })}
              className={`relative rounded-xl border p-4 text-left transition-colors ${
                selected
                  ? "border-brand-500 bg-brand-50/50 ring-2 ring-brand-100"
                  : "border-ink-200 bg-white hover:border-ink-300"
              }`}
            >
              {selected ? (
                <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-brand-400 text-[10px] font-bold text-ink-900">
                  ✓
                </span>
              ) : null}
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink-900">{meta.name}</span>
                {meta.recommended ? (
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-800">
                    가장 인기
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-lg font-bold text-ink-900">{meta.priceLabel}</div>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">{meta.description}</p>
              <ul className="mt-2.5 space-y-1">
                {meta.features.map((f) => (
                  <li key={f} className="flex gap-1.5 text-xs text-ink-600">
                    <span aria-hidden="true" className="text-brand-600">
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <p className="text-[13px] text-ink-500">
        지금은 결제 정보를 받지 않아요. 요금제는 승인 후 언제든 변경할 수 있어요.
      </p>

      {serverError ? (
        <div className="rounded-lg border border-danger-600/20 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {serverError}
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <button type="button" onClick={onBack} className={btnSecondary} disabled={submitting}>
          이전
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className={`${btnPrimary} min-w-[8.5rem]`}
        >
          {submitting ? "신청 중…" : "신청 완료하기"}
        </button>
      </div>
    </div>
  );
}
