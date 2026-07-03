import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api, apiErrorCode } from "../api/client";
import { Logo, btnSecondary } from "../components/ui";
import { consumeKakaoLoginState } from "../lib/kakao-login";
import { loginSession } from "../lib/session";
import { useSession } from "../lib/useSession";

function messageForKakaoError(code: string | null): string {
  switch (code) {
    case "kakao_account_not_found":
      return "카카오 이메일과 연결된 콜비 계정을 찾을 수 없어요. 먼저 이메일로 가입을 완료해 주세요.";
    case "kakao_email_required":
      return "카카오 계정 이메일 제공 동의가 필요해요. 다시 시도하면서 이메일 제공에 동의해 주세요.";
    case "kakao_not_configured":
      return "카카오 로그인 설정이 아직 완료되지 않았어요.";
    case "kakao_token_failed":
      return "카카오 인증 시간이 만료됐어요. 다시 로그인해 주세요.";
    case "invalid_params":
      return "카카오 로그인 요청 정보가 올바르지 않아요. 다시 시도해 주세요.";
    default:
      return "카카오 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
}

export function KakaoCallbackPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const kakaoError = searchParams.get("error");
    if (kakaoError) {
      setError("카카오 로그인이 취소되었거나 권한 동의가 완료되지 않았어요.");
      return;
    }

    const code = searchParams.get("code")?.trim();
    const returnedState = searchParams.get("state");
    if (!code) {
      setError("카카오 인증 코드를 찾을 수 없어요. 다시 로그인해 주세요.");
      return;
    }

    const saved = consumeKakaoLoginState();
    if (!saved.state || saved.state !== returnedState) {
      setError("로그인 확인값이 일치하지 않아요. 다시 시도해 주세요.");
      return;
    }

    api
      .kakaoLogin({ code, redirectUri: saved.redirectUri })
      .then((res) => {
        if (res.account.role !== "tenant_admin" || !res.account.tenantId) {
          setError("총괄관리자 계정은 관리자 앱에서 로그인해 주세요.");
          return;
        }
        loginSession({ token: res.token, account: res.account });
        navigate("/", { replace: true });
      })
      .catch((err: unknown) => {
        setError(messageForKakaoError(apiErrorCode(err)));
      });
  }, [navigate, searchParams]);

  if (session) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-50 p-4 text-ink-900">
      <Link to="/" className="mb-6" aria-label="콜비 홈">
        <Logo size="lg" />
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-brand-100 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold">
          {error ? "카카오 로그인 실패" : "카카오 로그인 확인 중"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          {error ?? "잠시만 기다려 주세요. 콜비 계정을 확인하고 있어요."}
        </p>
        {error ? (
          <Link to="/login" className={`${btnSecondary} mt-5 inline-flex`}>
            로그인으로 돌아가기
          </Link>
        ) : (
          <div
            className="mx-auto mt-5 h-8 w-8 animate-spin rounded-full border-2 border-brand-100 border-t-brand-500"
            aria-label="로그인 확인 중"
          />
        )}
      </div>
    </div>
  );
}
