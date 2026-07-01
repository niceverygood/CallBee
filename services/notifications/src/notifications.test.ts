import { describe, it, expect } from "vitest";
import {
  KAKAO_TEMPLATE_KEYS,
  type KakaoTemplateKey,
  type KakaoTemplateVarMap,
} from "@colli/contracts";
import {
  NotificationsService,
  MockAlimtalkProvider,
  InMemoryNotificationRepository,
  renderTemplate,
  TEMPLATE_RENDERERS,
  runWithRetry,
  backoffDelay,
  DEFAULT_RETRY_POLICY,
} from "./index.js";

/** 즉시 반환하는 sleep(테스트가 백오프를 기다리지 않도록). */
const noSleep = async () => {};

/** 각 템플릿 키에 대한 유효한 Vars 픽스처. */
const VARS: { [K in KakaoTemplateKey]: KakaoTemplateVarMap[K] } = {
  cs_received: { name: "홍길동", receivedAt: "2026-07-01T10:00:00Z" },
  ticket_created: {
    name: "홍길동",
    ticketId: "TKT-1001",
    summary: "로그인 오류",
  },
  ticket_resolved: {
    name: "홍길동",
    ticketId: "TKT-1001",
    resolution: "비밀번호 재설정 완료",
  },
  callback_scheduled: { name: "홍길동", scheduledAt: "2026-07-02T14:00:00Z" },
  selfservice_link: {
    name: "홍길동",
    url: "https://bobi.example/self/billing",
    kind: "billing",
  },
};

function makeService(provider: MockAlimtalkProvider) {
  const repository = new InMemoryNotificationRepository();
  const service = new NotificationsService({
    provider,
    repository,
    sleep: noSleep,
  });
  return { service, repository };
}

describe("template renderers", () => {
  it("contracts 의 5개 키 각각에 렌더러가 있다", () => {
    for (const key of KAKAO_TEMPLATE_KEYS) {
      expect(typeof TEMPLATE_RENDERERS[key]).toBe("function");
    }
    expect(Object.keys(TEMPLATE_RENDERERS).sort()).toEqual(
      [...KAKAO_TEMPLATE_KEYS].sort(),
    );
  });

  it("각 템플릿이 변수를 본문에 바인딩한다", () => {
    expect(renderTemplate("cs_received", VARS.cs_received)).toContain("홍길동");
    expect(renderTemplate("cs_received", VARS.cs_received)).toContain(
      "2026-07-01T10:00:00Z",
    );

    const ticketCreated = renderTemplate(
      "ticket_created",
      VARS.ticket_created,
    );
    expect(ticketCreated).toContain("TKT-1001");
    expect(ticketCreated).toContain("로그인 오류");

    const resolved = renderTemplate("ticket_resolved", VARS.ticket_resolved);
    expect(resolved).toContain("TKT-1001");
    expect(resolved).toContain("비밀번호 재설정 완료");

    expect(
      renderTemplate("callback_scheduled", VARS.callback_scheduled),
    ).toContain("2026-07-02T14:00:00Z");

    const link = renderTemplate("selfservice_link", VARS.selfservice_link);
    expect(link).toContain("https://bobi.example/self/billing");
    expect(link).toContain("결제 정보");
  });
});

describe("sendAlimtalk — 5개 템플릿 발송·상태기록", () => {
  for (const key of KAKAO_TEMPLATE_KEYS) {
    it(`${key}: 발송되고 sent 로 기록된다`, async () => {
      const provider = new MockAlimtalkProvider();
      const { service, repository } = makeService(provider);

      const outcome = await service.sendAlimtalk(key, "010-1234-5678", VARS[key]);

      expect(outcome.status).toBe("sent");
      expect(outcome.providerMsgId).toBeTruthy();
      expect(outcome.attempts).toBe(1);

      // 대행사가 렌더된 본문을 받았는지
      expect(provider.sent).toHaveLength(1);
      expect(provider.sent[0]!.templateKey).toBe(key);
      expect(provider.sent[0]!.to).toBe("010-1234-5678");
      expect(provider.sent[0]!.text).toBe(renderTemplate(key, VARS[key]));

      // Notification 레코드 상태
      const rec = await repository.findById(outcome.messageId);
      expect(rec).not.toBeNull();
      expect(rec!.status).toBe("sent");
      expect(rec!.providerMsgId).toBe(outcome.providerMsgId);
      expect(rec!.sentAt).toBeInstanceOf(Date);
      expect(rec!.toNumber).toBe("010-1234-5678");
      expect(rec!.vars).toEqual(VARS[key]);
    });
  }
});

describe("상태 전이 queued → sent", () => {
  it("발송 성공 시 최종 상태가 sent 이고 lastError 가 없다", async () => {
    const provider = new MockAlimtalkProvider();
    const { service, repository } = makeService(provider);

    const outcome = await service.sendAlimtalk(
      "cs_received",
      "010-0000-0000",
      VARS.cs_received,
    );

    const rec = await repository.findById(outcome.messageId);
    expect(rec!.status).toBe("sent");
    expect(rec!.lastError).toBeNull();
    expect(rec!.attempts).toBe(1);
  });

  it("markDelivered 로 sent → delivered 전이", async () => {
    const provider = new MockAlimtalkProvider();
    const { service, repository } = makeService(provider);

    const outcome = await service.sendAlimtalk(
      "cs_received",
      "010-0000-0000",
      VARS.cs_received,
    );
    await service.markDelivered(outcome.messageId);

    const rec = await repository.findById(outcome.messageId);
    expect(rec!.status).toBe("delivered");
  });
});

describe("재시도 — 실패→재시도→성공", () => {
  it("첫 2회 실패 후 3번째 성공하면 sent, attempts=3", async () => {
    const provider = new MockAlimtalkProvider({ failFor: [true, true] });
    const { service, repository } = makeService(provider);

    const outcome = await service.sendAlimtalk(
      "ticket_created",
      "010-1111-2222",
      VARS.ticket_created,
    );

    expect(outcome.status).toBe("sent");
    expect(outcome.attempts).toBe(3);
    expect(provider.callCount).toBe(3);

    const rec = await repository.findById(outcome.messageId);
    expect(rec!.status).toBe("sent");
    expect(rec!.attempts).toBe(3);
    expect(rec!.providerMsgId).toBeTruthy();
    expect(rec!.lastError).toBeNull();
  });

  it("최대 시도까지 모두 실패하면 failed, lastError 기록", async () => {
    const provider = new MockAlimtalkProvider({
      alwaysFail: true,
      error: { code: "TIMEOUT", message: "gateway timeout" },
    });
    const { service, repository } = makeService(provider);

    const outcome = await service.sendAlimtalk(
      "callback_scheduled",
      "010-3333-4444",
      VARS.callback_scheduled,
    );

    expect(outcome.status).toBe("failed");
    expect(outcome.attempts).toBe(DEFAULT_RETRY_POLICY.maxAttempts);
    expect(provider.callCount).toBe(DEFAULT_RETRY_POLICY.maxAttempts);
    expect(outcome.lastError).toContain("TIMEOUT");

    const rec = await repository.findById(outcome.messageId);
    expect(rec!.status).toBe("failed");
    expect(rec!.lastError).toContain("gateway timeout");
    expect(rec!.providerMsgId).toBeNull();
  });
});

describe("sendForTool — Worker C 소비 형태", () => {
  it("messageId/status 만 축약 반환한다", async () => {
    const provider = new MockAlimtalkProvider();
    const { service } = makeService(provider);

    const result = await service.sendForTool(
      "selfservice_link",
      "010-5555-6666",
      VARS.selfservice_link,
    );

    expect(Object.keys(result).sort()).toEqual(["messageId", "status"]);
    expect(result.status).toBe("sent");
    expect(result.messageId).toBeTruthy();
  });
});

describe("retry 유닛", () => {
  it("backoffDelay 는 지수·상한을 따른다", () => {
    const p = { maxAttempts: 5, baseDelayMs: 100, factor: 2, maxDelayMs: 500 };
    expect(backoffDelay(0, p)).toBe(100);
    expect(backoffDelay(1, p)).toBe(200);
    expect(backoffDelay(2, p)).toBe(400);
    expect(backoffDelay(3, p)).toBe(500); // 상한
  });

  it("runWithRetry 는 성공까지 시도 후 멈춘다", async () => {
    let n = 0;
    const res = await runWithRetry(
      async () => {
        n++;
        if (n < 2) return { ok: false as const, error: { code: "E", message: "x" } };
        return { ok: true as const, value: "done" };
      },
      DEFAULT_RETRY_POLICY,
      noSleep,
    );
    expect(res.outcome.ok).toBe(true);
    expect(res.attempts).toBe(2);
    expect(n).toBe(2);
  });
});
