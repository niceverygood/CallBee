/**
 * 테스트 하네스: 인메모리 포트로 ToolsService 를 조립한다(인프라 없이).
 */
import type { SubscriberProfile, SubscriberId } from "@colli/contracts";
import { ToolsService } from "../tools.service.js";
import {
  InMemoryBoBiRead,
  InMemoryNotifications,
  InMemoryTicketRepository,
  InMemoryKnowledgeRepository,
  InMemoryCallbackRepository,
  InMemorySessionStore,
  InMemoryTrace,
} from "../adapters/in-memory.js";

export function makeSubscriber(
  over: Partial<SubscriberProfile> = {},
): SubscriberProfile {
  return {
    subscriberId: "sub_1" as SubscriberId,
    name: "홍길동",
    phone: "+821012345678",
    tier: "pro",
    status: "active",
    billingState: "current",
    ...over,
  };
}

export function makeHarness(opts?: { subscribers?: SubscriberProfile[] }) {
  const bobi = new InMemoryBoBiRead(opts?.subscribers ?? []);
  const notifications = new InMemoryNotifications();
  const tickets = new InMemoryTicketRepository();
  const knowledge = new InMemoryKnowledgeRepository([
    {
      category: "usage",
      question: "고객 명단은 어디서 관리하나요",
      answer: "좌측 메뉴 '고객 관리'에서 명단을 추가·편집할 수 있어요.",
      keywords: ["고객", "명단", "관리", "customer"],
    },
    {
      category: "billing",
      question: "영수증은 어떻게 받나요",
      answer: "설정 > 결제 내역에서 영수증을 PDF로 내려받을 수 있어요.",
      keywords: ["영수증", "결제", "billing", "receipt"],
    },
  ]);
  const callbacks = new InMemoryCallbackRepository();
  const sessions = new InMemorySessionStore();
  const trace = new InMemoryTrace();

  const service = new ToolsService({
    bobi,
    notifications,
    tickets,
    knowledge,
    callbacks,
    sessions,
    trace,
  });

  return {
    service,
    bobi,
    notifications,
    tickets,
    knowledge,
    callbacks,
    sessions,
    trace,
  };
}
