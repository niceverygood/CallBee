/**
 * 얇은 NestJS 컨트롤러: POST /tools/:name.
 * ToolsService(순수 클래스)를 감싸고, 응답을 ToolInvocationResult 봉투로 반환한다.
 * 실제 로직은 전부 ToolsService 에 있다(계약 시그니처의 단일 소스).
 */
import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import {
  TOOL_NAMES,
  type ToolName,
  type ToolIO,
  type ToolInvocationResult,
  type CallSessionId,
} from "@colli/contracts";
import { ToolsService, ToolError } from "./tools.service.js";

@Controller("tools")
export class ToolsController {
  constructor(private readonly tools: ToolsService) {}

  @Post(":name")
  async invoke(
    @Param("name") name: string,
    @Body() body: unknown,
    // Worker A 가 통화 세션 식별자를 헤더로 전달(관측성·세션 상태 연결).
    @Headers("x-call-session-id") callSessionId?: string,
  ): Promise<ToolInvocationResult> {
    if (!isToolName(name)) {
      return {
        ok: false,
        tool: name as ToolName,
        error: { code: "unknown_tool", message: `unknown tool: ${name}` },
      };
    }
    try {
      const data = await this.tools.invoke(
        name,
        body as ToolIO[typeof name]["params"],
        { callSessionId: (callSessionId as CallSessionId) || undefined },
      );
      return { ok: true, tool: name, data } as ToolInvocationResult;
    } catch (err) {
      const code = err instanceof ToolError ? err.code : "internal_error";
      const message = err instanceof Error ? err.message : "unknown error";
      return { ok: false, tool: name, error: { code, message } };
    }
  }
}

function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}
