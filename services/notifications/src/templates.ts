/**
 * 카카오 알림톡 템플릿 렌더러 (5종).
 * 각 렌더러는 `@colli/contracts` 의 KakaoTemplateVarMap 해당 Vars 로만 바인딩된다.
 * 키↔Vars 매핑은 contracts 가 단일 소스 — 여기서 재정의하지 않는다.
 */
import {
  KAKAO_TEMPLATE_KEYS,
  type KakaoTemplateKey,
  type KakaoTemplateVarMap,
  type SelfServiceLinkVars,
} from "@colli/contracts";

/** 하나의 템플릿 키에 대한 렌더러: 해당 Vars → 최종 본문 문자열. */
export type TemplateRenderer<K extends KakaoTemplateKey> = (
  vars: KakaoTemplateVarMap[K],
) => string;

/** 모든 템플릿 키에 대한 렌더러 맵. */
export type TemplateRendererMap = {
  [K in KakaoTemplateKey]: TemplateRenderer<K>;
};

const SELFSERVICE_KIND_LABEL: Record<SelfServiceLinkVars["kind"], string> = {
  billing: "결제 정보",
  password: "비밀번호",
  plan_change: "요금제",
};

/**
 * 템플릿 본문 렌더러. 실제 카카오 승인 템플릿의 변수 슬롯(#{var})을 채운 형태를
 * 텍스트로 시뮬레이션한다. 대행사 전송 시 이 텍스트가 최종 본문이 된다.
 */
export const TEMPLATE_RENDERERS: TemplateRendererMap = {
  cs_received: ({ name, receivedAt }) =>
    [
      `[BoBi 고객센터] 접수 확인`,
      `${name}님, 문의가 정상 접수되었습니다.`,
      `접수 시각: ${receivedAt}`,
      `순차적으로 확인 후 안내드리겠습니다.`,
    ].join("\n"),

  ticket_created: ({ name, ticketId, summary }) =>
    [
      `[BoBi 고객센터] 접수번호 안내`,
      `${name}님, 문의가 티켓으로 등록되었습니다.`,
      `접수번호: ${ticketId}`,
      `내용: ${summary}`,
      `처리 상황은 알림톡으로 안내드립니다.`,
    ].join("\n"),

  ticket_resolved: ({ name, ticketId, resolution }) =>
    [
      `[BoBi 고객센터] 처리결과 안내`,
      `${name}님, 접수번호 ${ticketId} 건이 처리되었습니다.`,
      `처리결과: ${resolution}`,
      `추가 문의가 있으시면 언제든 연락 주세요.`,
    ].join("\n"),

  callback_scheduled: ({ name, scheduledAt }) =>
    [
      `[BoBi 고객센터] 콜백 예약 안내`,
      `${name}님, 상담 콜백이 예약되었습니다.`,
      `예정 시각: ${scheduledAt}`,
      `해당 시간에 담당자가 연락드리겠습니다.`,
    ].join("\n"),

  selfservice_link: ({ name, url, kind }) =>
    [
      `[BoBi 고객센터] ${SELFSERVICE_KIND_LABEL[kind]} 변경 안내`,
      `${name}님, 아래 링크에서 직접 처리하실 수 있습니다.`,
      `${url}`,
      `보안을 위해 링크에서만 진행해 주세요.`,
    ].join("\n"),
};

/**
 * 템플릿 키 + Vars 로 최종 본문을 렌더한다.
 * 키에 맞지 않는 Vars 는 타입에서 걸린다(호출 지점 타입 안전).
 */
export function renderTemplate<K extends KakaoTemplateKey>(
  templateKey: K,
  vars: KakaoTemplateVarMap[K],
): string {
  const renderer = TEMPLATE_RENDERERS[templateKey];
  return renderer(vars);
}

/** contracts 의 키 집합을 그대로 재노출(렌더러 커버리지 검증용). */
export const RENDERABLE_TEMPLATE_KEYS = KAKAO_TEMPLATE_KEYS;
