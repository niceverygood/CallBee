import { useTenantId } from "../lib/tenant";
import { useAgentConfigDraft } from "../lib/agent-config-draft";
import { FormField, inputCls, inputErrorCls } from "../components/FormField";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui";
import { ChipsInput } from "../components/ChipsInput";
import { SaveBar } from "../components/SaveBar";
import { Loading, ErrorBlock } from "../components/StateBlock";

/**
 * 운영 설정 > 통화 — product-spec §4.4.
 * 담당자 호전환 번호(숫자/하이픈 9~13자리) + 긴급 키워드 칩(최대 20개, 1~20자).
 */

const PHONE_RE = /^[\d-]{9,13}$/;

export function CallSettingsPage() {
  const tenantId = useTenantId();
  const { isLoading, error, draft, patch, save, saving, saveError, savedAt } =
    useAgentConfigDraft(tenantId);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;

  const phone = draft.transferPhoneNumber ?? "";
  const phoneInvalid = phone.length > 0 && !PHONE_RE.test(phone);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="통화 설정"
        subtitle="사람이 직접 받아야 할 전화를 어떻게 넘길지 정해요."
      />

      <Card className="space-y-5">
        <FormField
          label="담당자 호전환 번호"
          hint="사람 연결이 필요할 때 전화를 돌려받을 번호예요. 비워두면 호전환 대신 콜백을 접수해요."
          error={phoneInvalid ? "연락처 형식을 확인해 주세요" : null}
        >
          <input
            type="tel"
            className={phoneInvalid ? inputErrorCls : inputCls}
            value={phone}
            maxLength={13}
            onChange={(e) => patch({ transferPhoneNumber: e.target.value || null })}
            placeholder="010-1234-5678"
          />
        </FormField>

        <FormField
          label="긴급 키워드"
          hint="예: 화재, 가스, 응급 — 이 단어가 들리면 안내를 멈추고 바로 담당자에게 연결해요. 최대 20개."
        >
          <ChipsInput
            values={draft.emergencyKeywords ?? []}
            onChange={(next) => patch({ emergencyKeywords: next })}
            placeholder="키워드 입력 후 Enter"
            maxItems={20}
            maxLength={20}
          />
        </FormField>

        <div className="rounded-lg bg-ink-50 px-4 py-3 text-[13px] leading-relaxed text-ink-600">
          콜백 접수는 항상 켜져 있어요. AI 상담원이 처리하지 못한 문의는 성함과
          연락처를 받아 콜백으로 남겨드려요.
        </div>

        <SaveBar
          onSave={() => save()}
          saving={saving}
          savedAt={savedAt}
          error={saveError}
          disabled={phoneInvalid}
        />
      </Card>
    </div>
  );
}
