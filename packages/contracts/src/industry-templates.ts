/**
 * 업종 템플릿 팩 — "빈 캔버스" 온보딩 마찰을 없애는 업종별 시작 설정 묶음.
 *
 * /docs/tenant-platform-architecture.md §8 로드맵의 "앵글 B(업종 템플릿)"를
 * 스키마 변경 없이 애플리케이션 레벨로 재도입한다(같은 문서 "기각한 대안과
 * 사유"에서 예고한 경로 그대로 — TenantIntent/KnowledgeItem/TenantAgentConfig
 * 를 복제 생성하는 방식이며 신규 모델/마이그레이션이 없다).
 *
 * 설계 원칙:
 * - 팩은 시스템 tool(SYSTEM_TOOL_NAMES)만 참조한다. 커스텀 tool(webhook)을
 *   만들지 않는다 — 연동은 사업장이 직접 등록하는 축(ToolsPage)으로 유지.
 * - 적용은 항상 비파괴 merge 다(planIndustryTemplateApply 참조). 이미 있는
 *   의도 key / KB 질문 / 채워진 설정 필드는 절대 덮어쓰지 않는다.
 * - 매장마다 값이 다른 KB(영업시간·가격 등)는 enabledOnApply=false 로 두고
 *   "[…] 를 입력해 주세요" 형식의 안내 답변을 담는다. KnowledgeItem.enabled=false
 *   로 생성되므로 사장님이 답을 채우고 켜기 전에는 통화에서 절대 읽히지
 *   않는다(KnowledgeRepository.search 는 enabled=true 만 매칭).
 * - 플랫폼 불변 가드레일(결제정보/고지·동의)은 팩과 무관하게 코드 하드코드로
 *   유지된다 — 팩의 domainConstraints 는 "업종 특화 금지" 섹션에만 추가된다.
 *
 * 플레이스홀더 규칙:
 * - personaInstructions / kbItems[].answer 의 "{업체명}" 은 적용 시점에
 *   서비스명으로 치환돼 저장된다(planIndustryTemplateApply 책임).
 * - smsSettings 문구의 "{업체명}" 은 치환하지 않고 그대로 저장한다 — SmsSettings
 *   계약(tenant.ts)상 발송 시점 치환이 애플리케이션 책임이기 때문.
 */
import type { SystemToolName } from "./tools.js";
import type {
  IndustryPresetKey,
  SmsSettings,
  TenantAgentConfig,
} from "./tenant.js";
import { withJosa, type JosaPair } from "./korean.js";

// ── 팩 shape ────────────────────────────────────────────────────
/** 템플릿 팩이 존재하는 업종 key("other" 는 빈 캔버스 유지 — 팩 없음). */
export type IndustryTemplatePackKey = Exclude<IndustryPresetKey, "other">;

export interface IndustryTemplateIntent {
  /** TenantIntent.key 로 저장될 slug(테넌트 스코프 유일) */
  key: string;
  label: string;
  keywords: string[];
  /** 시스템 tool 만 참조. null = 플랫폼 기본 라우팅(get_kb_answer 폴백 등) */
  routingToolName: SystemToolName | null;
}

export interface IndustryTemplateKbItem {
  /** 같은 팩 intents 중 하나의 key (카탈로그 정합성 테스트로 강제) */
  category: string;
  question: string;
  /** "{업체명}" 플레이스홀더 허용(적용 시 치환 저장) */
  answer: string;
  keywords: string[];
  /**
   * false = 매장별 값이 필요한 "예시" 항목. KnowledgeItem.enabled=false 로
   * 생성돼 사장님이 답변을 채우고 직접 켜기 전에는 통화에 노출되지 않는다.
   */
  enabledOnApply: boolean;
}

export interface IndustryTemplatePack {
  industryKey: IndustryTemplatePackKey;
  /** 콘솔 카드 타이틀. 예: "식당·카페 팩" */
  title: string;
  /** 카드 서브카피(팩이 켜 주는 것 한 줄) */
  tagline: string;
  /** TenantAgentConfig.personaInstructions 로 들어갈 역할 서술("{업체명}" 허용) */
  personaInstructions: string;
  toneExtra: string[];
  /** "# 절대 금지 — 업종 특화" 섹션 렌더 대상 */
  domainConstraints: string[];
  /** 감지 시 즉시 사람 인계할 긴급 키워드(없는 업종은 빈 배열) */
  emergencyKeywords: string[];
  /**
   * 문자 안내 프리필 문구. 발송 여부 플래그는 전부 false — 문자 발송은
   * 명시적 opt-in 이라는 플랫폼 원칙(DEFAULT_SMS_SETTINGS 주석)을 팩도 따른다.
   * 이미 smsSettings 를 저장한 사업장에는 적용하지 않는다(merge 규칙).
   */
  smsSettings: SmsSettings;
  intents: IndustryTemplateIntent[];
  kbItems: IndustryTemplateKbItem[];
}

/** 팩 공통 문자 프리필 빌더(전부 발송 off — 문구만 채워 준다). */
function smsPreset(confirmationText: string): SmsSettings {
  return {
    confirmationEnabled: false,
    confirmationText,
    callbackNoticeEnabled: false,
    callbackNoticeText: "[{업체명}] 콜백이 접수되었습니다. 영업시간 내에 연락드리겠습니다.",
    missedCallEnabled: false,
    missedCallText: "[{업체명}] 지금은 영업시간이 아닙니다. 영업시간에 다시 연락드리겠습니다.",
  };
}

// ── 팩 카탈로그(7종 — INDUSTRY_PRESETS 의 "other" 제외 전 업종) ───
export const INDUSTRY_TEMPLATE_PACKS: readonly IndustryTemplatePack[] = [
  {
    industryKey: "restaurant_cafe",
    title: "식당·카페 팩",
    tagline: "예약 접수, 영업시간·주차·메뉴 안내를 바로 시작해요.",
    personaInstructions:
      "{업체명}은(는) 식당·카페입니다. 예약, 영업시간, 위치·주차, 메뉴, 포장 문의 전화를 응대합니다. " +
      "매장에서 확인이 필요한 요청(예약 확정, 단체 문의 등)은 접수 후 확인 연락을 드린다고 안내합니다.",
    toneExtra: [
      "식사 시간대에는 손님이 급한 경우가 많으니 간결하게 핵심부터 답합니다.",
      "예약 문의는 날짜·시간·인원을 빠짐없이 확인합니다.",
    ],
    domainConstraints: [
      "지식베이스에 등록되지 않은 메뉴 가격·재고·재료 정보를 임의로 안내하지 않는다.",
      "예약을 그 자리에서 확정하지 않는다 — 예약 '요청 접수'와 '확인 연락' 절차로만 안내한다.",
      "알레르기·원산지 등 확인이 필요한 질문은 단정하지 말고 확인 후 연락드린다고 안내한다.",
    ],
    emergencyKeywords: [],
    smsSettings: smsPreset("[{업체명}] 예약 요청이 접수되었습니다. 확인 후 연락드리겠습니다."),
    intents: [
      {
        key: "table_reservation",
        label: "예약",
        keywords: ["예약", "자리", "인원", "몇 명", "룸", "단체", "취소", "변경"],
        routingToolName: "create_ticket",
      },
      {
        key: "hours_holiday",
        label: "영업시간·휴무",
        keywords: ["영업시간", "몇 시", "언제까지", "마감", "브레이크", "휴무", "오늘 하"],
        routingToolName: "get_kb_answer",
      },
      {
        key: "location_parking",
        label: "위치·주차",
        keywords: ["위치", "어디", "주차", "찾아가", "역에서", "골목"],
        routingToolName: "get_kb_answer",
      },
      {
        key: "menu_price",
        label: "메뉴·가격",
        keywords: ["메뉴", "가격", "얼마", "추천", "코스", "아이", "비건"],
        routingToolName: "get_kb_answer",
      },
      {
        key: "takeout_group",
        label: "포장·단체주문",
        keywords: ["포장", "테이크아웃", "단체 주문", "케이터링", "도시락"],
        routingToolName: "create_ticket",
      },
    ],
    kbItems: [
      {
        category: "table_reservation",
        question: "예약은 어떻게 하나요?",
        answer:
          "전화로 날짜·시간·인원을 말씀해 주시면 예약 요청을 접수해 드려요. 확인 후 바로 연락드립니다.",
        keywords: ["예약", "방법"],
        enabledOnApply: true,
      },
      {
        category: "hours_holiday",
        question: "영업시간이 어떻게 되나요?",
        answer:
          "[영업시간을 입력해 주세요. 예: 매일 11:00~21:00, 브레이크타임 15:00~17:00, 매주 월요일 휴무]",
        keywords: ["영업시간", "휴무", "몇 시"],
        enabledOnApply: false,
      },
      {
        category: "location_parking",
        question: "주차 가능한가요?",
        answer:
          "[주차 안내를 입력해 주세요. 예: 매장 앞 전용 주차 2대, 만차 시 OO공영주차장(도보 3분) 이용]",
        keywords: ["주차", "발렛"],
        enabledOnApply: false,
      },
      {
        category: "menu_price",
        question: "대표 메뉴가 뭐예요?",
        answer:
          "[대표 메뉴와 가격을 입력해 주세요. 예: 크림 파스타 15,000원 / 마르게리타 피자 18,000원]",
        keywords: ["메뉴", "추천", "가격"],
        enabledOnApply: false,
      },
    ],
  },
  {
    industryKey: "hospital_clinic",
    title: "병원·의원 팩",
    tagline: "진료 예약 접수와 의료법에 안전한 응대 수칙을 기본 장착해요.",
    personaInstructions:
      "{업체명}은(는) 병원·의원입니다. 진료 예약·변경, 진료시간, 위치, 비용 등 접수 문의를 응대합니다. " +
      "의료적 판단이 필요한 질문에는 절대 직접 답하지 않고 내원 안내 또는 접수·인계로만 연결합니다.",
    toneExtra: [
      "차분하고 신뢰감 있는 톤을 유지하고, 어려운 의학 용어 대신 쉬운 표현을 씁니다.",
      "통증이나 불편을 호소하시면 공감을 먼저 표현한 뒤 안내합니다.",
    ],
    domainConstraints: [
      "증상에 대한 진단·처방·의학적 조언을 절대 하지 않는다 — 반드시 내원 안내 또는 접수로만 응대한다.",
      "검사 결과·진료 기록을 전화로 안내하지 않는다 — 내원 확인을 안내한다.",
      "시술·치료의 효과를 단정·보장하거나 권유하지 않는다(의료광고 규제).",
      "다른 병원과 비교하거나 평가하는 발언을 하지 않는다.",
    ],
    emergencyKeywords: ["응급", "숨이 안", "의식이 없", "쓰러졌", "출혈", "경련"],
    smsSettings: smsPreset("[{업체명}] 예약 요청이 접수되었습니다. 확인 후 연락드리겠습니다."),
    intents: [
      {
        key: "appointment",
        label: "진료 예약·변경",
        keywords: ["예약", "접수", "변경", "취소", "오늘 진료", "당일"],
        routingToolName: "create_ticket",
      },
      {
        key: "clinic_hours",
        label: "진료시간·휴진",
        keywords: ["진료시간", "몇 시", "점심시간", "주말", "토요일", "공휴일", "휴진"],
        routingToolName: "get_kb_answer",
      },
      {
        key: "location_parking",
        label: "위치·주차",
        keywords: ["위치", "어디", "주차", "몇 층", "찾아가"],
        routingToolName: "get_kb_answer",
      },
      {
        key: "fees",
        label: "비용·비급여",
        keywords: ["비용", "얼마", "가격", "보험", "실비", "비급여"],
        routingToolName: "get_kb_answer",
      },
      {
        key: "symptom_consult",
        label: "증상·진료 상담",
        keywords: ["아파서", "아픈데", "증상", "통증", "약", "부작용", "괜찮을까"],
        routingToolName: "escalate_to_human",
      },
    ],
    kbItems: [
      {
        category: "appointment",
        question: "예약 없이 방문해도 되나요?",
        answer:
          "[당일 접수 가능 여부를 입력해 주세요. 예: 당일 접수도 가능하지만 예약 우선이라 대기가 있을 수 있어요]",
        keywords: ["당일", "접수", "예약 없이"],
        enabledOnApply: false,
      },
      {
        category: "clinic_hours",
        question: "진료시간이 어떻게 되나요?",
        answer:
          "[진료시간을 입력해 주세요. 예: 평일 09:00~18:00(점심 13:00~14:00), 토 09:00~13:00, 일·공휴일 휴진]",
        keywords: ["진료시간", "휴진", "토요일"],
        enabledOnApply: false,
      },
      {
        category: "fees",
        question: "진료 비용은 얼마인가요?",
        answer:
          "[안내 가능한 비급여 항목과 비용을 입력해 주세요. 예: OO검사 30,000원 — 상세 비용은 내원 상담 시 안내]",
        keywords: ["비용", "가격", "비급여"],
        enabledOnApply: false,
      },
    ],
  },
  {
    industryKey: "beauty",
    title: "미용·뷰티 팩",
    tagline: "시술 예약(디자이너 지명 포함)과 가격 안내를 바로 시작해요.",
    personaInstructions:
      "{업체명}은(는) 미용·뷰티 매장입니다. 시술 예약(디자이너 지명 포함), 가격·소요시간, 영업시간·위치 문의를 응대합니다. " +
      "예약 요청은 접수 후 확인 연락을 드린다고 안내합니다.",
    toneExtra: [
      "밝고 친근한 톤으로 응대합니다.",
      "예약 문의는 원하시는 시술·날짜·시간·지명 디자이너를 확인합니다.",
    ],
    domainConstraints: [
      "시술 효과를 과장하거나 보장하지 않는다.",
      "부작용·피부 상태 등 전문 판단이 필요한 질문은 단정하지 말고 담당자 확인 후 연락을 안내한다.",
      "등록되지 않은 이벤트·할인 정보를 임의로 안내하지 않는다.",
    ],
    emergencyKeywords: [],
    smsSettings: smsPreset("[{업체명}] 예약 요청이 접수되었습니다. 확인 후 연락드리겠습니다."),
    intents: [
      {
        key: "booking",
        label: "예약·지명",
        keywords: ["예약", "지명", "디자이너", "원장님", "내일", "시간 돼요"],
        routingToolName: "create_ticket",
      },
      {
        key: "price_duration",
        label: "가격·소요시간",
        keywords: ["얼마", "가격", "시간 얼마나", "소요", "펌", "염색"],
        routingToolName: "get_kb_answer",
      },
      {
        key: "hours_location",
        label: "영업시간·위치",
        keywords: ["영업시간", "몇 시", "위치", "어디", "주차"],
        routingToolName: "get_kb_answer",
      },
      {
        key: "aftercare",
        label: "시술 후 문의",
        keywords: ["따가", "빨개", "부어", "유지", "관리", "샴푸해도"],
        routingToolName: "escalate_to_human",
      },
    ],
    kbItems: [
      {
        category: "booking",
        question: "예약은 어떻게 하나요?",
        answer:
          "전화로 원하시는 시술과 날짜·시간, 지명 디자이너가 있으면 함께 말씀해 주세요. 예약 요청을 접수하고 확인 후 연락드립니다.",
        keywords: ["예약", "방법"],
        enabledOnApply: true,
      },
      {
        category: "price_duration",
        question: "시술 가격이 어떻게 되나요?",
        answer:
          "[대표 시술 가격과 소요시간을 입력해 주세요. 예: 커트 25,000원(30분) / 펌 90,000원~(2시간)]",
        keywords: ["가격", "얼마", "메뉴"],
        enabledOnApply: false,
      },
      {
        category: "hours_location",
        question: "영업시간이 어떻게 되나요?",
        answer: "[영업시간을 입력해 주세요. 예: 화~일 10:00~20:00, 매주 월요일 휴무]",
        keywords: ["영업시간", "휴무"],
        enabledOnApply: false,
      },
    ],
  },
  {
    industryKey: "academy",
    title: "학원·교육 팩",
    tagline: "신규 상담을 리드로 접수하고, 시간표·수강료 문의를 자동 응대해요.",
    personaInstructions:
      "{업체명}은(는) 학원입니다. 신규 상담·레벨테스트 예약, 시간표·수강료, 결석·보강, 셔틀 문의를 응대합니다. " +
      "신규 상담 문의는 학생 학년과 연락처를 받아 담당 선생님이 연락드리도록 접수합니다.",
    toneExtra: ["학부모님 응대가 많으므로 정중하고 신뢰감 있게 응대합니다."],
    domainConstraints: [
      "성적 향상·합격을 보장하는 발언을 하지 않는다.",
      "수강료 할인·환불 규정을 임의로 안내하지 않는다 — 등록된 기준만 안내하고 그 외는 담당자 연락으로 접수한다.",
    ],
    emergencyKeywords: ["사고", "다쳤", "응급"],
    smsSettings: smsPreset("[{업체명}] 상담 요청이 접수되었습니다. 담당 선생님이 연락드리겠습니다."),
    intents: [
      {
        key: "new_consult",
        label: "신규 상담·레벨테스트",
        keywords: ["상담", "등록", "레벨테스트", "신규", "몇 학년", "보내려고"],
        routingToolName: "create_ticket",
      },
      {
        key: "schedule_fees",
        label: "시간표·수강료",
        keywords: ["시간표", "수강료", "얼마", "요일", "반", "몇 시 수업"],
        routingToolName: "get_kb_answer",
      },
      {
        key: "absence_makeup",
        label: "결석·보강",
        keywords: ["결석", "보강", "아파서", "빠져요", "못 가요"],
        routingToolName: "create_ticket",
      },
      {
        key: "shuttle",
        label: "셔틀·차량",
        keywords: ["셔틀", "차량", "픽업", "태워", "노선"],
        routingToolName: "get_kb_answer",
      },
    ],
    kbItems: [
      {
        category: "new_consult",
        question: "상담 받으려면 어떻게 하나요?",
        answer:
          "학생 학년과 연락처를 남겨 주시면 담당 선생님이 상담 일정을 잡아 연락드려요. 레벨테스트 예약도 함께 도와드립니다.",
        keywords: ["상담", "등록", "방법"],
        enabledOnApply: true,
      },
      {
        category: "schedule_fees",
        question: "수강료가 어떻게 되나요?",
        answer:
          "[과목·학년별 수강료를 입력해 주세요. 예: 초등 수학 주 2회 220,000원/월 — 교재비 별도]",
        keywords: ["수강료", "얼마"],
        enabledOnApply: false,
      },
      {
        category: "shuttle",
        question: "셔틀 운행하나요?",
        answer: "[셔틀 운행 여부와 노선을 입력해 주세요. 예: OO아파트~학원 순환, 등원 하원 각 1회]",
        keywords: ["셔틀", "차량"],
        enabledOnApply: false,
      },
    ],
  },
  {
    industryKey: "ecommerce",
    title: "쇼핑몰·이커머스 팩",
    tagline: "주문·배송·교환/반품 문의를 접수 티켓으로 자동 전환해요.",
    personaInstructions:
      "{업체명}은(는) 온라인 쇼핑몰입니다. 주문·배송, 교환·반품·환불, 상품 문의를 응대합니다. " +
      "주문 정보 확인이 필요한 문의는 주문번호·수령인 이름·연락처를 받아 접수하고, 확인 후 연락드린다고 안내합니다.",
    toneExtra: ["문의 내용을 요약해 되확인하고, 접수 후 어떻게 연락드릴지 명확히 안내합니다."],
    domainConstraints: [
      "재고·배송 예정일을 확인 없이 단정하지 않는다.",
      "교환·반품·환불 가능 여부를 임의로 확정하지 않는다 — 규정 안내 후 접수 처리한다.",
      "주문 확인을 위해 받는 정보는 주문번호·수령인 이름·연락처까지만으로 한정한다.",
    ],
    emergencyKeywords: [],
    smsSettings: smsPreset("[{업체명}] 문의가 접수되었습니다. 확인 후 순차적으로 연락드리겠습니다."),
    intents: [
      {
        key: "order_shipping",
        label: "주문·배송",
        keywords: ["배송", "언제 와요", "송장", "출발했", "주문 확인", "어디쯤"],
        routingToolName: "create_ticket",
      },
      {
        key: "exchange_return",
        label: "교환·반품·환불",
        keywords: ["교환", "반품", "환불", "사이즈", "잘못 왔"],
        routingToolName: "create_ticket",
      },
      {
        key: "product",
        label: "상품 문의",
        keywords: ["재고", "사이즈", "색상", "재입고", "소재"],
        routingToolName: "get_kb_answer",
      },
    ],
    kbItems: [
      {
        category: "order_shipping",
        question: "배송 조회는 어떻게 하나요?",
        answer:
          "주문번호와 수령인 성함을 말씀해 주시면 접수해서 확인 후 연락드려요. 문자로 배송 정보를 보내드릴 수도 있어요.",
        keywords: ["배송", "조회"],
        enabledOnApply: true,
      },
      {
        category: "exchange_return",
        question: "교환·반품 규정이 어떻게 되나요?",
        answer:
          "[교환·반품 규정을 입력해 주세요. 예: 수령 후 7일 이내 접수 가능, 단순 변심은 왕복 배송비 6,000원 고객 부담]",
        keywords: ["교환", "반품", "환불", "규정"],
        enabledOnApply: false,
      },
      {
        category: "order_shipping",
        question: "배송은 얼마나 걸리나요?",
        answer: "[평균 배송 기간을 입력해 주세요. 예: 결제 후 1~2일 내 출고, 출고 후 1~2일 내 도착(주말 제외)]",
        keywords: ["배송", "기간", "언제"],
        enabledOnApply: false,
      },
    ],
  },
  {
    industryKey: "real_estate",
    title: "부동산 팩",
    tagline: "현장에 있어도 매물 문의를 놓치지 않게 리드로 접수해요.",
    personaInstructions:
      "{업체명}은(는) 부동산 중개사무소입니다. 매물 문의, 방문 상담 예약, 매물 접수(내놓기) 전화를 응대합니다. " +
      "매물 상세·시세·계약 조건은 담당자가 확인 후 연락드리도록 원하시는 조건과 연락처를 받아 접수합니다.",
    toneExtra: ["원하시는 조건(지역·평수·예산·입주 시기)을 구체적으로 확인합니다."],
    domainConstraints: [
      "시세·투자 수익을 단정하거나 보장하지 않는다.",
      "확인되지 않은 매물 정보(가격·조건·계약 가능 여부)를 임의로 안내하지 않는다.",
      "계약 조건 협의는 반드시 담당자 연락으로 연결한다.",
    ],
    emergencyKeywords: [],
    smsSettings: smsPreset("[{업체명}] 문의가 접수되었습니다. 담당자가 확인 후 연락드리겠습니다."),
    intents: [
      {
        key: "listing_inquiry",
        label: "매물 문의",
        keywords: ["매물", "전세", "월세", "매매", "아직 있", "평수", "방 몇 개"],
        routingToolName: "create_ticket",
      },
      {
        key: "visit_booking",
        label: "방문 상담 예약",
        keywords: ["방문", "볼 수 있", "보러 가", "상담", "언제 가면"],
        routingToolName: "create_ticket",
      },
      {
        key: "sell_request",
        label: "매물 접수(내놓기)",
        keywords: ["내놓으려고", "팔려고", "세 놓으려고", "임대 놓"],
        routingToolName: "create_ticket",
      },
      {
        key: "office_info",
        label: "사무소 안내",
        keywords: ["위치", "영업시간", "어디", "몇 시까지"],
        routingToolName: "get_kb_answer",
      },
    ],
    kbItems: [
      {
        category: "listing_inquiry",
        question: "매물 문의하면 어떻게 되나요?",
        answer:
          "원하시는 조건(지역·평수·예산·입주 시기)과 연락처를 말씀해 주시면 접수해 두고, 담당자가 맞는 매물을 확인해서 바로 연락드려요.",
        keywords: ["매물", "문의", "방법"],
        enabledOnApply: true,
      },
      {
        category: "office_info",
        question: "사무소 위치와 영업시간이 어떻게 되나요?",
        answer: "[사무소 위치와 영업시간을 입력해 주세요. 예: OO역 2번 출구 도보 1분, 매일 09:00~19:00]",
        keywords: ["위치", "영업시간"],
        enabledOnApply: false,
      },
    ],
  },
  {
    industryKey: "lodging",
    title: "숙박 팩",
    tagline: "예약·빈방 문의 접수와 체크인·부대시설 안내를 자동화해요.",
    personaInstructions:
      "{업체명}은(는) 숙박업소입니다. 예약·빈방 문의, 체크인·체크아웃, 부대시설, 오시는 길 문의를 응대합니다. " +
      "빈방 확인이 필요한 예약 문의는 날짜·인원과 연락처를 받아 접수하고, 확인 후 연락드린다고 안내합니다.",
    toneExtra: ["여행 준비로 설레는 손님에게 친절하고 여유 있는 톤으로 응대합니다."],
    domainConstraints: [
      "빈방 여부·요금을 확인 없이 단정하지 않는다 — 예약 요청 접수 후 확인 연락으로 안내한다.",
      "요금 할인·흥정에 응하지 않는다 — 필요 시 담당자 연락으로 연결한다.",
    ],
    emergencyKeywords: ["화재", "불이 났", "가스", "응급"],
    smsSettings: smsPreset("[{업체명}] 예약 문의가 접수되었습니다. 확인 후 연락드리겠습니다."),
    intents: [
      {
        key: "availability",
        label: "예약·빈방",
        keywords: ["예약", "빈 방", "자리 있", "주말", "인원", "몇 명"],
        routingToolName: "create_ticket",
      },
      {
        key: "checkinout",
        label: "체크인·체크아웃",
        keywords: ["체크인", "체크아웃", "몇 시", "얼리", "레이트"],
        routingToolName: "get_kb_answer",
      },
      {
        key: "facilities",
        label: "부대시설",
        keywords: ["바베큐", "수영장", "조식", "애견", "취사", "와이파이"],
        routingToolName: "get_kb_answer",
      },
      {
        key: "directions",
        label: "오시는 길·주차",
        keywords: ["위치", "어디", "주차", "찾아가", "내비"],
        routingToolName: "get_kb_answer",
      },
    ],
    kbItems: [
      {
        category: "availability",
        question: "예약은 어떻게 하나요?",
        answer:
          "원하시는 날짜와 인원을 말씀해 주시면 예약 문의를 접수해 드려요. 빈방 확인 후 바로 연락드립니다.",
        keywords: ["예약", "방법"],
        enabledOnApply: true,
      },
      {
        category: "checkinout",
        question: "체크인·체크아웃 시간이 어떻게 되나요?",
        answer: "[체크인·체크아웃 시간을 입력해 주세요. 예: 체크인 15:00 / 체크아웃 11:00]",
        keywords: ["체크인", "체크아웃", "시간"],
        enabledOnApply: false,
      },
      {
        category: "facilities",
        question: "바베큐 가능한가요?",
        answer: "[부대시설 안내를 입력해 주세요. 예: 객실별 개별 바베큐장 — 숯·그릴 세트 20,000원]",
        keywords: ["바베큐", "부대시설"],
        enabledOnApply: false,
      },
    ],
  },
] as const;

export const INDUSTRY_TEMPLATE_PACK_KEYS: IndustryTemplatePackKey[] =
  INDUSTRY_TEMPLATE_PACKS.map((p) => p.industryKey);

export function findIndustryTemplatePack(
  industryKey: string | null | undefined,
): IndustryTemplatePack | undefined {
  if (!industryKey) return undefined;
  return INDUSTRY_TEMPLATE_PACKS.find((p) => p.industryKey === industryKey);
}

// ── 적용 계획(순수 함수 — I/O 없음, apps/api 와 콘솔 데모가 공유) ──
/**
 * 적용은 항상 비파괴 merge: 이미 있는 것은 절대 덮어쓰지 않는다.
 * - 의도: 같은 key 가 있으면 skip. 신규는 기존 sortOrder 최대값 뒤에 배치.
 * - KB: 같은 질문(공백 trim 비교)이 있으면 skip. enabledOnApply=false 항목은
 *   KnowledgeItem.enabled=false 로 생성(답변을 채우고 켜기 전 통화 미노출).
 * - 에이전트 설정: 빈 필드만 채운다(personaInstructions/smsSettings), 배열
 *   필드(toneExtra/domainConstraints/emergencyKeywords)는 없는 항목만 append.
 *   greetingText/closingText/영업시간 등 나머지는 건드리지 않는다.
 */
export interface IndustryTemplateApplyInput {
  /** "{업체명}" 치환에 쓸 서비스명(기존 agentConfig.serviceName 또는 tenant.name) */
  serviceName: string;
  /** 현재 에이전트 설정(없으면 null — 팩 기본값으로 신규 생성 계획을 세운다) */
  agentConfig: TenantAgentConfig | null;
  existingIntents: ReadonlyArray<{ key: string; sortOrder: number }>;
  existingKbQuestions: readonly string[];
}

export interface PlannedTemplateIntent {
  key: string;
  label: string;
  keywords: string[];
  routingToolName: string | null;
  sortOrder: number;
  enabled: boolean;
}

export interface PlannedTemplateKbItem {
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  enabled: boolean;
}

export interface IndustryTemplateApplyPlan {
  /** upsert 할 최종 에이전트 설정(tenantId 제외 — 저장은 호출자 책임) */
  agentConfig: Omit<TenantAgentConfig, "tenantId">;
  /** 기존 설정 대비 실제 변경이 있는지(신규 생성 포함) */
  agentConfigChanged: boolean;
  /** 설정이 아예 없어 신규 생성인지 */
  agentConfigCreated: boolean;
  intentsToCreate: PlannedTemplateIntent[];
  skippedIntentKeys: string[];
  kbToCreate: PlannedTemplateKbItem[];
  skippedKbQuestions: string[];
}

/**
 * "{업체명}" 치환. 조사 병기형("{업체명}은(는)" 등)이 붙어 있으면 상호명의
 * 받침에 맞는 조사 하나로 골라 자연스럽게 치환한다(korean.ts) — 음성 응대라
 * "은(는)"을 그대로 두면 TTS 가 병기를 읽어버린다. 받침 판정이 불가한
 * 상호(영문 등)는 병기형을 유지한다.
 */
function fillServiceName(text: string, serviceName: string): string {
  let out = text;
  const josaPatterns: Array<[string, JosaPair]> = [
    ["{업체명}은(는)", "은/는"],
    ["{업체명}이(가)", "이/가"],
    ["{업체명}을(를)", "을/를"],
    ["{업체명}과(와)", "과/와"],
  ];
  for (const [pattern, pair] of josaPatterns) {
    out = out.split(pattern).join(withJosa(serviceName, pair));
  }
  return out.split("{업체명}").join(serviceName);
}

/** 배열 뒤에 "아직 없는 항목"만 덧붙인다(정확히 일치 기준 dedupe). */
function appendMissing(current: readonly string[], additions: readonly string[]): string[] {
  const seen = new Set(current);
  const out = [...current];
  for (const item of additions) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

export function planIndustryTemplateApply(
  pack: IndustryTemplatePack,
  input: IndustryTemplateApplyInput,
): IndustryTemplateApplyPlan {
  const serviceName = input.serviceName.trim() || "우리 매장";

  // ── 에이전트 설정 merge(빈 필드만 채움) ──
  const agentConfigCreated = input.agentConfig === null;
  const base: Omit<TenantAgentConfig, "tenantId"> = input.agentConfig
    ? { ...input.agentConfig }
    : {
        serviceName,
        agentName: "상담원",
        greetingText: null,
        personaInstructions: null,
        toneExtra: [],
        domainConstraints: [],
        intentUnresolvedFallbackTool: "request_callback",
        maxIntentAttempts: 2,
      };

  const next: Omit<TenantAgentConfig, "tenantId"> = {
    ...base,
    personaInstructions: base.personaInstructions?.trim()
      ? base.personaInstructions
      : fillServiceName(pack.personaInstructions, serviceName),
    toneExtra: appendMissing(base.toneExtra, pack.toneExtra),
    domainConstraints: appendMissing(base.domainConstraints, pack.domainConstraints),
    emergencyKeywords: appendMissing(base.emergencyKeywords ?? [], pack.emergencyKeywords),
    smsSettings: base.smsSettings ?? pack.smsSettings,
  };

  const agentConfigChanged =
    agentConfigCreated || JSON.stringify(next) !== JSON.stringify(input.agentConfig);

  // ── 의도: 같은 key 는 skip, 신규는 기존 sortOrder 뒤에 배치 ──
  const existingKeys = new Set(input.existingIntents.map((i) => i.key));
  const maxSortOrder = input.existingIntents.reduce((max, i) => Math.max(max, i.sortOrder), 0);
  const intentsToCreate: PlannedTemplateIntent[] = [];
  const skippedIntentKeys: string[] = [];
  let cursor = maxSortOrder;
  for (const intent of pack.intents) {
    if (existingKeys.has(intent.key)) {
      skippedIntentKeys.push(intent.key);
      continue;
    }
    cursor += 10;
    intentsToCreate.push({
      key: intent.key,
      label: intent.label,
      keywords: [...intent.keywords],
      routingToolName: intent.routingToolName,
      sortOrder: cursor,
      enabled: true,
    });
  }

  // ── KB: 같은 질문(trim 비교)은 skip ──
  const existingQuestions = new Set(input.existingKbQuestions.map((q) => q.trim()));
  const kbToCreate: PlannedTemplateKbItem[] = [];
  const skippedKbQuestions: string[] = [];
  for (const item of pack.kbItems) {
    if (existingQuestions.has(item.question.trim())) {
      skippedKbQuestions.push(item.question);
      continue;
    }
    kbToCreate.push({
      category: item.category,
      question: item.question,
      answer: fillServiceName(item.answer, serviceName),
      keywords: [...item.keywords],
      enabled: item.enabledOnApply,
    });
  }

  return {
    agentConfig: next,
    agentConfigChanged,
    agentConfigCreated,
    intentsToCreate,
    skippedIntentKeys,
    kbToCreate,
    skippedKbQuestions,
  };
}

// ── 적용 결과 요약(API 응답 DTO — POST /tenants/:id/industry-template) ──
export interface ApplyIndustryTemplateResult {
  industryKey: IndustryTemplatePackKey;
  packTitle: string;
  agentConfigCreated: boolean;
  agentConfigUpdated: boolean;
  createdIntentKeys: string[];
  skippedIntentKeys: string[];
  /** 생성된 KB 중 답변을 채워야 켤 수 있는(비활성 생성) 질문 목록 */
  createdKbQuestionsNeedingAnswer: string[];
  /** 생성 즉시 활성인 KB 질문 목록 */
  createdKbQuestionsEnabled: string[];
  skippedKbQuestions: string[];
}
