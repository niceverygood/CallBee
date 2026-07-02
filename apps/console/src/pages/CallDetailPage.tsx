import { Link, useParams } from "react-router-dom";
import { useTenantId } from "../lib/tenant";
import { useCall, useIntents } from "../api/hooks";
import { maskPhone, formatDateTime, formatDuration } from "../lib/format";
import { OUTCOME_LABELS, OUTCOME_BADGE_TONES, SPEAKER_LABELS } from "../lib/labels";
import { Card } from "../components/ui";
import { Badge } from "../components/Badge";
import { Loading, ErrorBlock } from "../components/StateBlock";

/**
 * 통화 기록 상세 — product-spec §4.9.
 * 요약 / 전사(마스킹된 텍스트, 말풍선) / 처리 결과 / 녹음(URL 있으면 플레이어).
 */
export function CallDetailPage() {
  const tenantId = useTenantId();
  const params = useParams<{ callId: string }>();
  const callId = params.callId ?? "";
  const { data: call, isLoading, error } = useCall(tenantId, callId);
  const { data: intents } = useIntents(tenantId);

  if (isLoading) return <Loading />;
  if (error || !call) return <ErrorBlock error={error ?? new Error("통화 기록을 찾을 수 없어요")} />;

  const intentLabel = call.intent
    ? (intents?.find((i) => String(i.key) === call.intent)?.label ?? call.intent)
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link
          to={`/tenants/${tenantId}/calls`}
          className="text-[13px] font-medium text-ink-500 hover:text-ink-900"
        >
          ← 통화 기록으로
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-bold leading-snug text-ink-900">
            {maskPhone(call.from)}
          </h1>
          {call.outcome ? (
            <Badge tone={OUTCOME_BADGE_TONES[call.outcome]}>{OUTCOME_LABELS[call.outcome]}</Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-ink-500">
          {formatDateTime(call.startedAt)} · {formatDuration(call.durationSec)}
          {intentLabel ? <> · 문의 유형: {intentLabel}</> : null}
        </p>
      </div>

      {call.summary ? (
        <Card>
          <h2 className="text-base font-semibold text-ink-900">요약</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">{call.summary}</p>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-base font-semibold text-ink-900">녹음</h2>
        {call.recordingUrl ? (
          <audio controls preload="none" src={call.recordingUrl} className="mt-3 w-full">
            <track kind="captions" />
          </audio>
        ) : (
          <p className="mt-2 text-[13px] text-ink-500">이 통화의 녹음 파일이 없어요.</p>
        )}
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-ink-900">전사</h2>
        {call.transcript.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-500">전사 내용이 없어요.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {call.transcript.map((seg, i) =>
              seg.role === "system" ? (
                <p key={i} className="text-center text-xs text-ink-400">
                  {seg.text}
                </p>
              ) : (
                <div
                  key={i}
                  className={`flex ${seg.role === "caller" ? "justify-end" : "justify-start"}`}
                >
                  <div className="max-w-[80%]">
                    <div
                      className={`mb-0.5 text-[11px] font-medium text-ink-400 ${
                        seg.role === "caller" ? "text-right" : ""
                      }`}
                    >
                      {SPEAKER_LABELS[seg.role]} · {formatDuration(seg.atSec)} 시점
                    </div>
                    <div
                      className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        seg.role === "caller"
                          ? "rounded-tr-sm bg-brand-400 text-ink-900"
                          : "rounded-tl-sm bg-ink-100 text-ink-800"
                      }`}
                    >
                      {seg.text}
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </Card>

      {call.toolInvocations.length > 0 ? (
        <Card>
          <h2 className="text-base font-semibold text-ink-900">처리 내역</h2>
          <p className="mt-1 text-[13px] text-ink-500">
            이 통화에서 AI 상담원이 실행한 작업이에요.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {call.toolInvocations.map((t, i) => (
              <Badge key={`${t}_${i}`} tone="bg-ink-100 text-ink-600">
                {t}
              </Badge>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
