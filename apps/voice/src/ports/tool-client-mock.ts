/**
 * InMemoryToolClient — ToolClient 포트의 인메모리 목.
 * Worker C 실 엔드포인트 없이, 등록된 핸들러로 tool 결과를 돌려준다.
 * 테스트에서 호출 이력(invocations)으로 "tool 1회 위임"을 검증한다.
 */
import type {
  ToolName,
  ToolParams,
  ToolResult,
  ToolInvocationResult,
} from "@colli/contracts";
import type { ToolClient } from "./tool-client.js";

export interface ToolInvocationLog {
  tool: ToolName;
  params: ToolParams<ToolName>;
}

/** tool 별 결과를 만드는 핸들러(부분 등록 가능) */
export type ToolHandlers = {
  [T in ToolName]?: (
    params: ToolParams<T>,
  ) => ToolResult<T> | Promise<ToolResult<T>>;
};

export class InMemoryToolClient implements ToolClient {
  readonly invocations: ToolInvocationLog[] = [];
  private readonly handlers: ToolHandlers;

  constructor(handlers: ToolHandlers = {}) {
    this.handlers = handlers;
  }

  async invoke<T extends ToolName>(
    tool: T,
    params: ToolParams<T>,
  ): Promise<ToolInvocationResult<T>> {
    this.invocations.push({ tool, params });
    const handler = this.handlers[tool] as
      | ((p: ToolParams<T>) => ToolResult<T> | Promise<ToolResult<T>>)
      | undefined;

    if (!handler) {
      return {
        ok: false,
        tool,
        error: {
          code: "NO_HANDLER",
          message: `no mock handler registered for tool "${tool}"`,
        },
      };
    }

    try {
      const data = await handler(params);
      return { ok: true, tool, data };
    } catch (err) {
      return {
        ok: false,
        tool,
        error: {
          code: "HANDLER_THREW",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}
