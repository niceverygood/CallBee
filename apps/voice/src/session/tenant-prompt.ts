/**
 * 세션 바인딩용 system prompt 조립 — 임시 위임 지점.
 *
 * 설계 결정(Design 브리핑): "세션의 system prompt 는 ctx.agentConfig+ctx.intents 를
 * dialogue 워커가 만든 buildTenantSystemPrompt() 에 넘겨 조립한 결과를 사용" 하되,
 * "api 가 문자열까지 조립해 반환하는 방식"이 voice 워커 부담이 적어 권장된다.
 *
 * `ResolvedTenantAgentContext`(@colli/contracts) 는 완성 문자열 필드를 갖지 않는다
 * (agentConfig 구조화 필드 + intents 배열만 계약으로 고정됨 — 통짜 문자열을 계약에
 * 추가하는 것은 contracts 변경이라 Orchestrator 승인이 필요해 이번 범위 밖이다).
 * 따라서 voice 워커는 여기 이 얇은 조립 함수만 소유한다.
 *
 * ⚠️ 확인됨: packages/dialogue/src/system-prompt.ts 에 `buildTenantSystemPrompt(ctx)`
 * 가 이미 동일 시그니처(`{ agentConfig, intents, consentAlreadyCaptured?,
 * identityVerified? }`)로 구현되어 있다(dialogue 워커 완료). 다만 `@colli/dialogue`
 * 는 apps/voice 의 package.json 에 의존성만 추가된 상태이며 아직 워크스페이스에
 * 설치되지 않았다(이 저장소 지시사항 — pnpm install/add 는 Orchestrator가 일괄
 * 실행). **Orchestrator 의 일괄 설치 이후** 이 함수의 내부 구현을
 * `import { buildTenantSystemPrompt } from "@colli/dialogue"` 호출로 교체하면
 * 된다(시그니처·호출부는 변경 없음 — session-handler.ts 는 이 함수만 참조한다).
 *
 * BoBi(테넌트 #1) 문구 재현: agentConfig.serviceName/agentName 이 기존
 * PLACEHOLDER_SYSTEM_PROMPT 와 동일한 톤(친절·간결, 결제정보 음성수집 금지)을
 * 포함하도록 조립한다 — GUARDRAIL #1/#2/#3 문구는 여기서도 고정 문자열로 항상
 * 포함시켜 agentConfig 로 끌 수 없게 한다(설계 문서 §3.1 원칙과 동일 방향).
 */
import type {
  TenantAgentConfig,
  TenantIntentDefinition,
} from "@colli/contracts";

export interface TenantSystemPromptInput {
  agentConfig: TenantAgentConfig;
  intents: TenantIntentDefinition[];
}

export function buildTenantSystemPromptForSession(
  ctx: TenantSystemPromptInput,
): string {
  const { agentConfig, intents } = ctx;
  const greeting =
    agentConfig.greetingText ??
    `안녕하세요, ${agentConfig.serviceName} 고객센터의 AI 상담원 ${agentConfig.agentName}입니다.`;

  const lines: string[] = [];
  lines.push(`# 역할`);
  lines.push(
    `당신은 ${agentConfig.serviceName} 고객센터의 AI 상담원 ${agentConfig.agentName}입니다.`,
  );
  if (agentConfig.personaInstructions) {
    lines.push(agentConfig.personaInstructions);
  }

  lines.push(``, `# 대화 톤과 방식`);
  lines.push(
    `친절하고 간결하게 응대합니다. 한 번에 한 질문만 합니다. 이름/번호/날짜는 복창해 확인합니다.`,
  );
  for (const extra of agentConfig.toneExtra) {
    lines.push(extra);
  }

  lines.push(``, `# 첫 인사`);
  lines.push(greeting);

  if (intents.length > 0) {
    lines.push(``, `# 의도 파악`);
    lines.push(`문의를 아래 카탈로그에 맞춰 분류합니다:`);
    for (const intent of intents) {
      lines.push(`- ${intent.label} (${intent.key})`);
    }
    lines.push(
      `의도 파악이 ${agentConfig.maxIntentAttempts}회 반복 실패하면 ` +
        `${agentConfig.intentUnresolvedFallbackTool} 로 폴백합니다(무한 루프 금지).`,
    );
  }

  lines.push(``, `# 절대 금지 — 결제정보`);
  lines.push(
    `결제수단·카드번호·CVC·계좌 정보는 음성으로 수집·복창·저장하지 않습니다. ` +
      `결제 변경은 셀프서비스 링크로만 유도합니다.`,
  );

  if (agentConfig.domainConstraints.length > 0) {
    lines.push(``, `# 절대 금지 — 업종 특화`);
    for (const constraint of agentConfig.domainConstraints) {
      lines.push(constraint);
    }
  }

  lines.push(``, `# tool 사용 규칙`);
  lines.push(
    `상태를 바꾸는 행동(티켓 생성, 구독 조회, 인계, 알림 발송)은 반드시 tool 함수 ` +
      `호출로만 합니다. 자유 서술로 상태를 만들지 않습니다.`,
  );

  return lines.join("\n");
}
