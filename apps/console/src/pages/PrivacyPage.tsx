import { Link } from "react-router-dom";
import { Logo } from "../components/ui";
import { SUPPORT_EMAIL } from "../lib/labels";

const EFFECTIVE_DATE = "2026년 7월 14일";

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to="/" aria-label="콜비 홈">
            <Logo />
          </Link>
          <Link className="text-sm font-semibold text-brand-700 hover:underline" to="/">
            홈으로
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-2xl border border-ink-100 bg-white p-7 shadow-sm sm:p-10">
          <p className="text-sm font-semibold text-brand-700">Privacy</p>
          <h1 className="mt-2 text-3xl font-bold text-ink-900">개인정보처리방침</h1>
          <p className="mt-3 text-sm text-ink-500">시행일: {EFFECTIVE_DATE}</p>

          <div className="mt-10 space-y-9 text-[15px] leading-7 text-ink-700">
            <section>
              <h2 className="text-lg font-bold text-ink-900">1. 적용 범위</h2>
              <p className="mt-2">
                본 방침은 콜비(Callbee) 웹 및 Android 앱에 적용됩니다. 현재 공개된 Android
                앱은 제품 체험용 데모로 동작하며, 입력한 정보는 기기 안에서만 처리되고 콜비
                서버로 전송되지 않습니다.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-ink-900">2. 처리하는 정보</h2>
              <p className="mt-2">
                데모 과정에서 이메일, 사업장 이름, 전화번호 등의 정보를 입력할 수 있으나,
                해당 정보는 데모 화면 구성에만 사용되며 외부 서버에 수집·저장되지 않습니다.
                결제수단, 카드번호, CVC, 계좌 정보는 앱과 음성 상담에서 수집하지 않습니다.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-ink-900">3. 권한 및 제3자 제공</h2>
              <p className="mt-2">
                현재 Android 앱은 인터넷 접속 외에 카메라, 마이크, 위치, 연락처 등의 민감한
                기기 권한을 요청하지 않습니다. 개인정보를 광고 사업자 또는 데이터 중개업자에게
                판매하거나 제공하지 않습니다.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-ink-900">4. 보관 및 삭제</h2>
              <p className="mt-2">
                데모 데이터는 앱 저장공간에만 보관되며 앱 데이터 삭제 또는 앱 제거 시 함께
                삭제됩니다. 실서비스 기능이 활성화되는 경우 수집 항목, 이용 목적, 보유 기간과
                삭제 절차를 이 방침에 반영한 뒤 적용합니다.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-ink-900">5. 아동의 개인정보</h2>
              <p className="mt-2">
                콜비는 사업자와 사업장 운영자를 위한 서비스이며 만 18세 미만을 대상으로 하지
                않습니다.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-ink-900">6. 문의</h2>
              <p className="mt-2">
                개인정보 관련 문의는{" "}
                <a className="font-semibold text-brand-700 hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
                  {SUPPORT_EMAIL}
                </a>
                로 보내주세요.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
