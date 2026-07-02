import type { SmsSettings } from "@colli/contracts";
import { DEFAULT_SMS_SETTINGS } from "@colli/contracts";
import { useTenantId } from "../lib/tenant";
import { useAgentConfigDraft } from "../lib/agent-config-draft";
import { smsByteLength } from "../lib/format";
import { textareaCls } from "../components/FormField";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui";
import { SaveBar } from "../components/SaveBar";
import { Loading, ErrorBlock } from "../components/StateBlock";

/**
 * 운영 설정 > 문자 안내 — product-spec §4.5.
 * SmsSettings 토글 3쌍(접수 확인/콜백 예약/부재중) + 문구 + 90바이트 카운터.
 * 실제 자동 발송은 로드맵 — 상단 준비 중 배너로 안내.
 */

interface SmsItemMeta {
  enabledKey: keyof Pick<
    SmsSettings,
    "confirmationEnabled" | "callbackNoticeEnabled" | "missedCallEnabled"
  >;
  textKey: keyof Pick<
    SmsSettings,
    "confirmationText" | "callbackNoticeText" | "missedCallText"
  >;
  title: string;
  description: string;
  defaultText: string;
}

const SMS_ITEMS: SmsItemMeta[] = [
  {
    enabledKey: "confirmationEnabled",
    textKey: "confirmationText",
    title: "접수 확인 문자",
    description: "문의가 접수되면 고객에게 확인 문자를 남겨요.",
    defaultText: "[{업체명}] 문의가 접수되었습니다. 순차적으로 연락드리겠습니다.",
  },
  {
    enabledKey: "callbackNoticeEnabled",
    textKey: "callbackNoticeText",
    title: "콜백 예약 안내 문자",
    description: "콜백이 접수되면 예약 안내 문자를 남겨요.",
    defaultText: "[{업체명}] 콜백이 접수되었습니다. 영업시간 내에 연락드리겠습니다.",
  },
  {
    enabledKey: "missedCallEnabled",
    textKey: "missedCallText",
    title: "부재중(영업시간 외) 안내 문자",
    description: "영업시간 외 통화가 끝나면 안내 문자를 남겨요.",
    defaultText: "[{업체명}] 지금은 영업시간이 아닙니다. 영업시간에 다시 연락드리겠습니다.",
  },
];

export function SmsSettingsPage() {
  const tenantId = useTenantId();
  const { isLoading, error, draft, patch, save, saving, saveError, savedAt } =
    useAgentConfigDraft(tenantId);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;

  const settings: SmsSettings = draft.smsSettings ?? { ...DEFAULT_SMS_SETTINGS };

  const setSettings = (partial: Partial<SmsSettings>) =>
    patch({ smsSettings: { ...settings, ...partial } });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="문자 안내"
        subtitle="통화가 끝난 뒤 고객에게 남길 안내 문자를 정해요."
      />

      {/* 준비 중 배너 */}
      <div className="mb-5 rounded-xl border border-info-600/20 bg-info-50 px-4 py-3 text-[13px] leading-relaxed text-info-600">
        문자 자동 발송은 준비 중이에요. 지금은 설정을 저장해두면 통화 안내에 먼저
        반영돼요 — AI 상담원이 "안내 문자를 보내드릴게요"라고 말할지 여기서
        정해져요.
      </div>

      <Card className="space-y-5">
        {SMS_ITEMS.map((item) => {
          const enabled = settings[item.enabledKey];
          const text = settings[item.textKey] ?? "";
          const counted = text || item.defaultText;
          const bytes = smsByteLength(counted.replace("{업체명}", draft.serviceName || ""));
          return (
            <div key={item.enabledKey} className="border-b border-ink-100 pb-5 last:border-b-0 last:pb-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-ink-900">{item.title}</h2>
                  <p className="mt-0.5 text-[13px] text-ink-500">{item.description}</p>
                </div>
                <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={`${item.title} 사용`}
                    className="peer sr-only"
                    checked={enabled}
                    onChange={(e) => setSettings({ [item.enabledKey]: e.target.checked })}
                  />
                  <span className="h-6 w-11 rounded-full bg-ink-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-brand-400 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 peer-focus-visible:ring-offset-1" />
                </label>
              </div>
              {enabled ? (
                <div className="mt-3">
                  <textarea
                    rows={2}
                    className={textareaCls}
                    value={text}
                    onChange={(e) => setSettings({ [item.textKey]: e.target.value || null })}
                    placeholder={item.defaultText}
                  />
                  <p
                    className={`mt-1 text-right text-[12px] ${
                      bytes > 90 ? "font-semibold text-warn-600" : "text-ink-400"
                    }`}
                  >
                    약 {bytes}바이트 {bytes > 90 ? "· 90바이트가 넘으면 장문(LMS)으로 발송돼요" : "/ 단문(SMS) 90바이트"}
                  </p>
                  <p className="text-[12px] text-ink-400">
                    {"{업체명}"} 을 쓰면 발송할 때 사업장 표시명으로 바뀌어요. 비워두면 기본
                    문구를 사용해요.
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}

        <SaveBar onSave={() => save()} saving={saving} savedAt={savedAt} error={saveError} />
      </Card>
    </div>
  );
}
