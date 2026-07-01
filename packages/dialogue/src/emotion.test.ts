/**
 * tagEmotion 감정 태깅 테스트.
 */
import { describe, it, expect } from "vitest";
import { EMOTIONS } from "@colli/contracts";
import { tagEmotion } from "./emotion.js";

describe("tagEmotion", () => {
  it("화난 발화 → angry, 사과 힌트, 우선인계", () => {
    const t = tagEmotion("아니 이게 말이 돼요? 너무 화가 나네요 당장 책임져요");
    expect(t.emotion).toBe("angry");
    expect(t.prioritize).toBe(true);
    expect(t.hint).toContain("사과");
  });

  it("급한 발화 → urgent, 우선인계", () => {
    const t = tagEmotion("이거 급합니다, 오늘 안에 빨리 처리돼야 해요");
    expect(t.emotion).toBe("urgent");
    expect(t.prioritize).toBe(true);
    expect(t.hint).not.toBeNull();
  });

  it("혼란 발화 → confused, 우선인계 아님", () => {
    const t = tagEmotion("무슨 말인지 모르겠고 너무 헷갈려요");
    expect(t.emotion).toBe("confused");
    expect(t.prioritize).toBe(false);
  });

  it("평이한 발화 → neutral, 힌트 없음", () => {
    const t = tagEmotion("네 알겠습니다 감사합니다");
    expect(t.emotion).toBe("neutral");
    expect(t.hint).toBeNull();
    expect(t.prioritize).toBe(false);
  });

  it("모든 감정 태그는 계약의 EMOTIONS 에 속한다", () => {
    const samples = [
      "화가 나요",
      "급해요",
      "모르겠어요",
      "괜찮습니다",
    ];
    for (const s of samples) {
      expect(EMOTIONS).toContain(tagEmotion(s).emotion);
    }
  });
});
