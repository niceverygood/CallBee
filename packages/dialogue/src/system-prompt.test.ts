/**
 * buildSystemPrompt 가드레일 반영 테스트.
 */
import { describe, it, expect } from "vitest";
import { INTENT_LABELS } from "@colli/contracts";
import { buildSystemPrompt, buildEmotionHint } from "./system-prompt.js";

describe("buildSystemPrompt", () => {
  it("가드레일 핵심 문구를 포함한다", () => {
    const p = buildSystemPrompt();
    // 결제정보 음성수집 금지
    expect(p).toContain("카드번호");
    expect(p).toContain("send_selfservice_link");
    // 상태 변경은 tool 로만
    expect(p).toContain("tool");
    // 초입 고지(고지·동의 미완료 기본값)
    expect(p).toContain("녹음");
    // 본인확인
    expect(p).toContain("본인확인");
    expect(p).toContain("lookup_subscriber");
    // 보험상품 판단 금지
    expect(p).toContain("보험상품");
    expect(p).toContain("escalate_to_human");
  });

  it("톤 규칙(한 번에 하나 질문, 복창)을 포함한다", () => {
    const p = buildSystemPrompt();
    expect(p).toContain("하나");
    expect(p).toContain("복창");
  });

  it("7개 의도 라벨을 카탈로그에 렌더한다", () => {
    const p = buildSystemPrompt();
    for (const label of Object.values(INTENT_LABELS)) {
      expect(p).toContain(label);
    }
  });

  it("consentAlreadyCaptured=true 면 초입 고지 섹션을 생략한다", () => {
    const done = buildSystemPrompt({ consentAlreadyCaptured: true });
    const notDone = buildSystemPrompt({ consentAlreadyCaptured: false });
    expect(notDone).toContain("통화 시작");
    expect(done).not.toContain("통화 시작");
  });

  it("identityVerified=true 면 본인확인 완료 문구", () => {
    const p = buildSystemPrompt({ identityVerified: true });
    expect(p).toContain("본인확인이 완료");
  });

  it("serviceName/agentName 커스터마이즈 반영", () => {
    const p = buildSystemPrompt({ serviceName: "콜리", agentName: "콜리봇" });
    expect(p).toContain("콜리");
    expect(p).toContain("콜리봇");
  });

  it("결정론적: 동일 옵션 → 동일 출력", () => {
    expect(buildSystemPrompt({ agentName: "보비" })).toBe(
      buildSystemPrompt({ agentName: "보비" }),
    );
  });

  it("buildEmotionHint 는 힌트를 블록으로 감싼다", () => {
    const h = buildEmotionHint("천천히 응대하세요");
    expect(h).toContain("천천히 응대하세요");
  });
});
