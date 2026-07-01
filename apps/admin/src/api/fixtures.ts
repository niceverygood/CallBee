/**
 * 목(mock) 데이터 소스. 백엔드(Worker C)가 뜨기 전 UI 렌더/개발용.
 * VITE_DATA_SOURCE=fetch 로 전환하면 실제 API 를 호출한다(client.ts 참조).
 *
 * 브랜드ID 는 문자열이므로 `as` 캐스팅으로 만든다(런타임 동일, 타입 안전용).
 */
import type {
  CallSessionId,
  ClawOpsCallId,
  SubscriberId,
  TicketId,
  CallbackId,
  KnowledgeItemId,
} from "@colli/contracts";
import type {
  CallDetail,
  CallListItem,
  TicketRow,
  CallbackRow,
  KnowledgeItem,
  DashboardMetrics,
} from "./types";

const cid = (s: string) => s as unknown as CallSessionId;
const clawId = (s: string) => s as unknown as ClawOpsCallId;
const sid = (s: string) => s as unknown as SubscriberId;
const tid = (s: string) => s as unknown as TicketId;
const cbid = (s: string) => s as unknown as CallbackId;
const kid = (s: string) => s as unknown as KnowledgeItemId;

export const CALL_DETAILS: CallDetail[] = [
  {
    id: cid("call_1001"),
    clawOpsCallId: clawId("claw_aa01"),
    from: "+821012345678",
    to: "+8207011112222",
    direction: "inbound",
    intent: "billing",
    emotion: "neutral",
    outcome: "selfservice_sent",
    subscriberId: sid("sub_501"),
    subscriberName: "김보험",
    startedAt: "2026-06-30T09:12:00+09:00",
    durationSec: 184,
    recordingUrl: "https://recordings.example/claw_aa01.mp3",
    summary:
      "결제수단 변경 문의. 카드정보 음성수집 없이 셀프서비스 링크(알림톡)로 안내함.",
    transcript: [
      { role: "system", atSec: 0, text: "AI 상담원이 응대하며 통화는 녹음됩니다." },
      { role: "caller", atSec: 4, text: "카드가 바뀌어서 결제수단을 바꾸고 싶은데요." },
      { role: "agent", atSec: 8, text: "결제수단 변경은 보안을 위해 링크로 안내드릴게요." },
      { role: "agent", atSec: 20, text: "알림톡으로 셀프서비스 링크를 보내드렸습니다." },
    ],
    toolInvocations: ["lookup_subscriber", "send_selfservice_link", "send_kakao_alimtalk"],
  },
  {
    id: cid("call_1002"),
    clawOpsCallId: clawId("claw_aa02"),
    from: "+821098765432",
    to: "+8207011112222",
    direction: "inbound",
    intent: "tech_error",
    emotion: "angry",
    outcome: "ticket_created",
    subscriberId: sid("sub_777"),
    subscriberName: "이설계",
    startedAt: "2026-06-30T10:41:00+09:00",
    durationSec: 322,
    recordingUrl: "https://recordings.example/claw_aa02.mp3",
    summary: "리포트 내보내기 오류. high 심각도 티켓 생성 후 개발 인계.",
    transcript: [
      { role: "system", atSec: 0, text: "AI 상담원이 응대하며 통화는 녹음됩니다." },
      { role: "caller", atSec: 5, text: "리포트 다운로드가 계속 실패해요. 급합니다." },
      { role: "agent", atSec: 10, text: "불편을 드려 죄송합니다. 바로 접수해 드릴게요." },
      { role: "agent", atSec: 40, text: "티켓 TCK-2002 로 접수되었고 개발팀에 전달했습니다." },
    ],
    toolInvocations: ["lookup_subscriber", "create_ticket", "escalate_to_human"],
  },
  {
    id: cid("call_1003"),
    clawOpsCallId: clawId("claw_aa03"),
    from: "+821055557777",
    to: "+8207011112222",
    direction: "inbound",
    intent: "usage",
    emotion: "neutral",
    outcome: "kb_answered",
    subscriberId: sid("sub_501"),
    subscriberName: "김보험",
    startedAt: "2026-06-30T13:05:00+09:00",
    durationSec: 96,
    recordingUrl: null,
    summary: "고객 그룹 나누는 방법 문의. 지식베이스로 즉시 해결.",
    transcript: [
      { role: "system", atSec: 0, text: "AI 상담원이 응대하며 통화는 녹음됩니다." },
      { role: "caller", atSec: 3, text: "고객을 그룹으로 나누려면 어떻게 하나요?" },
      { role: "agent", atSec: 7, text: "고객 관리 > 그룹에서 새 그룹을 만들 수 있어요." },
    ],
    toolInvocations: ["get_kb_answer"],
  },
  {
    id: cid("call_1004"),
    clawOpsCallId: clawId("claw_aa04"),
    from: "+821033334444",
    to: "+8207011112222",
    direction: "inbound",
    intent: "churn",
    emotion: "urgent",
    outcome: "transferred",
    subscriberId: sid("sub_888"),
    subscriberName: "박해지",
    startedAt: "2026-06-30T15:22:00+09:00",
    durationSec: 210,
    recordingUrl: "https://recordings.example/claw_aa04.mp3",
    summary: "해지 의사. 리텐션 영업으로 warm transfer.",
    transcript: [
      { role: "system", atSec: 0, text: "AI 상담원이 응대하며 통화는 녹음됩니다." },
      { role: "caller", atSec: 4, text: "구독을 해지하려고요." },
      { role: "agent", atSec: 9, text: "담당자에게 바로 연결해 드리겠습니다." },
    ],
    toolInvocations: ["lookup_subscriber", "route_to_sales"],
  },
  {
    id: cid("call_1005"),
    clawOpsCallId: clawId("claw_aa05"),
    from: "+821077778888",
    to: "+8207011112222",
    direction: "inbound",
    intent: null,
    emotion: "confused",
    outcome: "callback_queued",
    subscriberId: null,
    subscriberName: null,
    startedAt: "2026-06-30T16:48:00+09:00",
    durationSec: 63,
    recordingUrl: null,
    summary: "의도 파악 반복 실패로 콜백 예약.",
    transcript: [
      { role: "system", atSec: 0, text: "AI 상담원이 응대하며 통화는 녹음됩니다." },
      { role: "caller", atSec: 3, text: "저기 그게 좀 그런데요..." },
      { role: "agent", atSec: 30, text: "정확히 도와드리기 위해 담당자 콜백을 예약했습니다." },
    ],
    toolInvocations: ["request_callback"],
  },
];

export const CALL_LIST: CallListItem[] = CALL_DETAILS.map((c) => {
  const {
    recordingUrl: _r,
    summary: _s,
    transcript: _t,
    toolInvocations: _i,
    ...rest
  } = c;
  return rest;
});

export const TICKETS: TicketRow[] = [
  {
    id: tid("TCK-2002"),
    subscriberId: sid("sub_777"),
    subscriberName: "이설계",
    category: "tech_error",
    summary: "리포트 내보내기 실패(엑셀 다운로드 500)",
    severity: "high",
    status: "in_progress",
    assignee: "개발-정",
    callId: cid("call_1002"),
    createdAt: "2026-06-30T10:45:00+09:00",
    updatedAt: "2026-06-30T11:10:00+09:00",
  },
  {
    id: tid("TCK-2003"),
    subscriberId: sid("sub_501"),
    subscriberName: "김보험",
    category: "billing",
    summary: "세금계산서 재발행 요청",
    severity: "low",
    status: "open",
    assignee: null,
    callId: null,
    createdAt: "2026-06-30T12:02:00+09:00",
    updatedAt: "2026-06-30T12:02:00+09:00",
  },
  {
    id: tid("TCK-2004"),
    subscriberId: sid("sub_888"),
    subscriberName: "박해지",
    category: "usage",
    summary: "알림 설정이 저장되지 않음",
    severity: "medium",
    status: "open",
    assignee: "CS-한",
    callId: null,
    createdAt: "2026-06-30T14:30:00+09:00",
    updatedAt: "2026-06-30T14:30:00+09:00",
  },
  {
    id: tid("TCK-2001"),
    subscriberId: sid("sub_777"),
    subscriberName: "이설계",
    category: "tech_error",
    summary: "로그인 2단계 인증 문자 미수신",
    severity: "critical",
    status: "resolved",
    assignee: "개발-정",
    callId: null,
    createdAt: "2026-06-29T09:00:00+09:00",
    updatedAt: "2026-06-30T08:20:00+09:00",
  },
];

export const CALLBACKS: CallbackRow[] = [
  {
    id: cbid("cb_9001"),
    subscriberId: null,
    phone: "+821077778888",
    subscriberName: null,
    summary: "의도 파악 실패 — 재상담 필요",
    urgency: "normal",
    status: "queued",
    scheduledAt: null,
    createdAt: "2026-06-30T16:49:00+09:00",
  },
  {
    id: cbid("cb_9002"),
    subscriberId: sid("sub_501"),
    phone: "+821012345678",
    subscriberName: "김보험",
    summary: "요금제 업그레이드 상담 희망",
    urgency: "high",
    status: "scheduled",
    scheduledAt: "2026-07-01T10:00:00+09:00",
    createdAt: "2026-06-30T17:05:00+09:00",
  },
  {
    id: cbid("cb_9000"),
    subscriberId: sid("sub_888"),
    phone: "+821033334444",
    subscriberName: "박해지",
    summary: "리텐션 후속 상담",
    urgency: "low",
    status: "completed",
    scheduledAt: "2026-06-30T18:00:00+09:00",
    createdAt: "2026-06-30T15:30:00+09:00",
  },
];

export const KB_ITEMS: KnowledgeItem[] = [
  {
    id: kid("kb_001"),
    category: "usage",
    question: "고객을 그룹으로 나누는 방법",
    answer:
      "고객 관리 > 그룹 메뉴에서 '새 그룹'을 만들고 고객을 드래그해 배정할 수 있습니다.",
    tags: ["그룹", "고객관리", "세그먼트"],
    updatedAt: "2026-06-20T09:00:00+09:00",
  },
  {
    id: kid("kb_002"),
    category: "billing",
    question: "결제수단(카드) 변경",
    answer:
      "보안을 위해 카드정보는 전화로 받지 않습니다. 알림톡으로 발송되는 셀프서비스 링크에서 직접 변경해 주세요.",
    tags: ["결제", "카드", "셀프서비스"],
    updatedAt: "2026-06-22T09:00:00+09:00",
  },
  {
    id: kid("kb_003"),
    category: "tech_error",
    question: "리포트 다운로드가 실패할 때",
    answer:
      "브라우저 캐시를 지운 뒤 재시도하고, 계속 실패하면 오류 시각과 함께 접수해 주시면 개발팀이 확인합니다.",
    tags: ["리포트", "다운로드", "오류"],
    updatedAt: "2026-06-28T09:00:00+09:00",
  },
  {
    id: kid("kb_004"),
    category: "upgrade",
    question: "요금제 업그레이드 혜택",
    answer:
      "Pro 요금제는 무제한 고객 관리와 고급 리포트를 제공합니다. 자세한 상담은 담당자 연결이 가능합니다.",
    tags: ["요금제", "업그레이드", "Pro"],
    updatedAt: "2026-06-25T09:00:00+09:00",
  },
];

export const METRICS: DashboardMetrics = {
  answerRate: 0.94,
  autoResolveRate: 0.62,
  handoffCount: 12,
  callbackWaiting: 1,
  totalCalls: 137,
  openTickets: 2,
};
