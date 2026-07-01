/**
 * @colli/notifications — Worker D: 카카오 알림톡 어댑터 + 템플릿 + 발송/상태/재시도.
 * 공유 타입/키는 @colli/contracts 단일 소스에서만 온다.
 */
export type {
  AlimtalkProvider,
  AlimtalkSendPayload,
  AlimtalkSendResult,
} from "./provider.js";

export {
  MockAlimtalkProvider,
  type MockProviderOptions,
} from "./mock-provider.js";

export {
  TEMPLATE_RENDERERS,
  RENDERABLE_TEMPLATE_KEYS,
  renderTemplate,
  type TemplateRenderer,
  type TemplateRendererMap,
} from "./templates.js";

export {
  InMemoryNotificationRepository,
  type NotificationRepository,
  type NotificationRecord,
  type CreateNotificationInput,
  type UpdateNotificationInput,
} from "./repository.js";

export {
  runWithRetry,
  backoffDelay,
  realSleep,
  DEFAULT_RETRY_POLICY,
  type RetryPolicy,
  type SleepFn,
  type AttemptOutcome,
  type RunWithRetryResult,
} from "./retry.js";

export {
  NotificationsService,
  type NotificationsServiceDeps,
  type SendAlimtalkOutcome,
} from "./service.js";
