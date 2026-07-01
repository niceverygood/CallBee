/**
 * 세션 바인딩용 system prompt 조립.
 *
 * 설계 결정(Design 브리핑): "세션의 system prompt 는 ctx.agentConfig+ctx.intents 를
 * dialogue 워커가 만든 buildTenantSystemPrompt() 에 넘겨 조립한 결과를 사용".
 *
 * `@colli/dialogue` 의 `buildTenantSystemPrompt(ctx)` 가 동일 시그니처
 * (`{ agentConfig, intents, consentAlreadyCaptured?, identityVerified? }`)로
 * 이미 구현되어 있다(dialogue 워커 완료, packages/dialogue/src/system-prompt.ts).
 * `@colli/dialogue` 는 apps/voice/node_modules 에 workspace 링크로 설치되어
 * 있고 dist 빌드도 존재하는 상태를 확인했으므로 여기서는 바로 import 해 위임한다.
 *
 * 이 함수는 얇은 어댑터로 남는다 — session-handler.ts 는 이 함수만 참조하므로
 * 시그니처는 그대로 유지한다.
 */
import type {
  TenantAgentConfig,
  TenantIntentDefinition,
} from "@colli/contracts";
import { buildTenantSystemPrompt } from "@colli/dialogue";

export interface TenantSystemPromptInput {
  agentConfig: TenantAgentConfig;
  intents: TenantIntentDefinition[];
}

export function buildTenantSystemPromptForSession(
  ctx: TenantSystemPromptInput,
): string {
  return buildTenantSystemPrompt({
    agentConfig: ctx.agentConfig,
    intents: ctx.intents,
  });
}
