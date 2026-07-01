import { Link, useParams } from "react-router-dom";
import type { SpeakerRole } from "@colli/contracts";
import { useCall } from "../api/hooks";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { Loading, ErrorBlock } from "../components/StateBlock";
import {
  intentLabel,
  EMOTION_LABELS,
  EMOTION_TONE,
  OUTCOME_LABELS,
  formatDateTime,
  formatDuration,
} from "../lib/labels";

const ROLE_LABELS: Record<SpeakerRole, string> = {
  caller: "고객",
  agent: "AI",
  system: "시스템",
};

const ROLE_TONE: Record<SpeakerRole, string> = {
  caller: "bg-slate-100 text-slate-700",
  agent: "bg-brand-50 text-brand-700",
  system: "bg-slate-50 text-slate-400",
};

export function CallDetailPage() {
  const { id = "" } = useParams();
  const { data, isLoading, error } = useCall(id);

  return (
    <div>
      <PageHeader
        title="통화 상세"
        subtitle={id}
        actions={
          <Link
            to="/calls"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            ← 목록
          </Link>
        }
      />

      {isLoading ? <Loading /> : null}
      {error ? <ErrorBlock error={error} /> : null}

      {data ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {/* 녹취 재생 자리 */}
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-700">녹취</h2>
              {data.recordingUrl ? (
                <audio controls src={data.recordingUrl} className="w-full">
                  녹취 재생을 지원하지 않는 브라우저입니다.
                </audio>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-400">
                  녹취 파일 없음 (재생 자리)
                </div>
              )}
            </section>

            {/* 전사 */}
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">전사</h2>
              <ul className="space-y-3">
                {data.transcript.map((seg, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-12 shrink-0 pt-0.5 text-right text-xs tabular-nums text-slate-400">
                      {formatDuration(seg.atSec)}
                    </span>
                    <div>
                      <Badge tone={ROLE_TONE[seg.role]}>
                        {ROLE_LABELS[seg.role]}
                      </Badge>
                      <p className="mt-1 text-sm text-slate-700">{seg.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* 사이드: 요약 + 메타 */}
          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-700">요약</h2>
              <p className="text-sm text-slate-600">
                {data.summary ?? "요약 없음"}
              </p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">정보</h2>
              <dl className="space-y-2">
                <Row k="발신번호" v={<span className="font-mono">{data.from}</span>} />
                <Row k="구독자" v={data.subscriberName ?? "미확인"} />
                <Row k="시각" v={formatDateTime(data.startedAt)} />
                <Row k="통화시간" v={formatDuration(data.durationSec)} />
                <Row k="의도" v={intentLabel(data.intent)} />
                <Row
                  k="감정"
                  v={
                    data.emotion ? (
                      <Badge tone={EMOTION_TONE[data.emotion]}>
                        {EMOTION_LABELS[data.emotion]}
                      </Badge>
                    ) : (
                      "—"
                    )
                  }
                />
                <Row
                  k="결과"
                  v={data.outcome ? OUTCOME_LABELS[data.outcome] : "—"}
                />
              </dl>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-700">
                Tool 호출 trace
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {data.toolInvocations.length ? (
                  data.toolInvocations.map((t, i) => (
                    <Badge key={i} tone="bg-slate-100 text-slate-600">
                      {t}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">없음</span>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-right text-slate-700">{v}</dd>
    </div>
  );
}
