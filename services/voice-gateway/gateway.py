"""콜비 voice-gateway — ClawOps 인바운드 통화를 테넌트 설정으로 응대하는 게이트웨이.

동작 개요
  기동 시   GET /tenants/resolve?toNumber={CLAWOPS_070_NUMBER} 로 테넌트 컨텍스트
            로드 → systemPrompt 로 OpenAIRealtime 구성.
  통화 시작  call_start 핸들러에서 컨텍스트를 refetch 해 최신 프롬프트를 세션에
            반영한다. SDK(clawops 0.31.0) 소스 확인 결과:
            - OpenAI Realtime WS 연결은 매 통화 session.start()→prewarm() 에서
              새로 열리고, instructions 는 그 시점의 _config.system_prompt 를 읽는다.
            - 인바운드 경로는 `await call._emit("call_start")` 가 session.start()
              **이전에** 순차 await 되므로(_agent.py:_start_call_session),
              call_start 핸들러에서 _config.system_prompt 를 갱신하면 바로 그
              통화에 적용된다. (prewarm 선행은 outbound 전용이라 경합 없음.)
  통화 기록  call_start → POST /ingest/calls(멱등), transcript → .../transcripts,
            call_end → .../complete. 전부 try/except — ingest 실패는 통화를
            깨지 않는다. 헤더 x-gateway-secret 사용.
  tool      get_kb_answer 를 apps/api POST /tools/get_kb_answer 로 프록시
            (x-tenant-id / x-call-session-id 헤더 포함).

프롬프트 폴백
  resolve 응답에 systemPrompt 가 아직 없으면(1번 워커 작업 중) greetingText +
  personaInstructions 만으로 임시 최소 프롬프트를 조립한다. @colli/dialogue 의
  buildTenantSystemPrompt 조립을 복제하지 않는다(가드레일 단일 소스 원칙) —
  systemPrompt 필드가 배포되면 폴백은 자동으로 비활성화된다.

실행
  python gateway.py           # 인바운드 대기
  python gateway.py --check   # 연결 전 단계 점검(env/resolve/프롬프트) 후 종료
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any

import certifi

# python.org macOS 빌드는 시스템 CA 번들을 못 찾는 경우가 있어(SSLCertVerificationError),
# certifi 번들을 명시적으로 지정한다. clawops/aiohttp import 전에 설정해야 한다.
os.environ.setdefault("SSL_CERT_FILE", certifi.where())

from dotenv import load_dotenv

_HERE = os.path.dirname(os.path.abspath(__file__))
# cwd 와 무관하게 동작하도록 .env 는 이 파일 옆에서 로드하고, 로컬 모듈 import 경로를 보장한다.
load_dotenv(os.path.join(_HERE, ".env"))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from colli_api import ColliApiClient, ColliApiError  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
log = logging.getLogger("voice-gateway")

# 컨텍스트 refetch 대기 한도 — greeting 지연을 이 이하로 억제한다.
# 초과/실패 시 직전(부팅/이전 통화) 컨텍스트로 응대한다.
REFRESH_TIMEOUT_S = 2.5

# resolve 자체가 한 번도 성공 못 했을 때의 안전 프롬프트(테넌트 정보 없음).
SAFE_BOOT_PROMPT = (
    "당신은 콜비(Callbee) AI 전화 상담원입니다. 통화가 연결되면 먼저 "
    '"안녕하세요, AI 상담원입니다. AI가 응대하며 통화 내용이 녹음됩니다."라고 '
    "고지하세요. 현재 상점 설정을 불러오지 못했으므로, 자세한 안내가 어렵다는 "
    "점을 정중히 알리고 잠시 후 다시 전화해 달라고 안내하세요."
)


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ── 프롬프트 결정 ────────────────────────────────────────────────


def build_fallback_prompt(ctx: dict[str, Any]) -> str:
    """systemPrompt 미수신 시의 임시 최소 조립 — greetingText + personaInstructions 만.

    주의: @colli/dialogue buildTenantSystemPrompt 를 복제하지 않는다. AI 응대·녹음
    고지 한 줄만 컴플라이언스 최소선으로 포함한다.
    """
    cfg = ctx.get("agentConfig") or {}
    service = cfg.get("serviceName") or "고객센터"
    agent_name = cfg.get("agentName") or "AI 상담원"
    greeting = cfg.get("greetingText") or (
        f"안녕하세요, {service} 고객센터의 AI 상담원 {agent_name}입니다."
    )
    lines = [
        f"당신은 {service} 고객센터의 AI 상담원 \"{agent_name}\"입니다.",
        f'통화가 연결되면 다른 어떤 말보다 먼저 이렇게 인사하세요: "{greeting}"',
        '그 다음 바로 이어서 "AI가 응대하며 통화 내용이 녹음됩니다"라고 고지하세요.',
    ]
    persona = cfg.get("personaInstructions")
    if persona:
        lines.append("")
        lines.append(str(persona))
    lines.append("")
    lines.append(
        "자주 묻는 질문(사용법·요금·영업시간 등)은 get_kb_answer 도구로 지식베이스를 "
        "검색해 그 결과를 근거로만 답하세요. 근거가 없으면 아는 척하지 말고 "
        "확인 후 연락드리겠다고 안내하세요."
    )
    return "\n".join(lines)


def extract_system_prompt(ctx: dict[str, Any]) -> tuple[str, str]:
    """(prompt, source) — source: 'server'(resolve 의 systemPrompt) | 'fallback'."""
    sp = ctx.get("systemPrompt")
    if isinstance(sp, str) and sp.strip():
        return sp, "server"
    return build_fallback_prompt(ctx), "fallback"


# ── 게이트웨이 상태 ──────────────────────────────────────────────


class GatewayState:
    """현재 테넌트 컨텍스트 + 진행 중 통화 북키핑(Individual 플랜: 동시 1콜)."""

    def __init__(self) -> None:
        self.context: dict[str, Any] | None = None
        self.system_prompt: str = SAFE_BOOT_PROMPT
        self.prompt_source: str = "none"
        self.tenant_id: str | None = None
        self.current_call_id: str | None = None
        # call_id → {"t0": monotonic, "ingest_id": str|None, "register_task": Task|None}
        self.calls: dict[str, dict[str, Any]] = {}


async def refresh_context(
    state: GatewayState,
    api: ColliApiClient,
    to_number: str,
    *,
    timeout_s: float = REFRESH_TIMEOUT_S,
    reason: str = "",
) -> bool:
    """resolve 를 refetch 해 state 를 갱신한다. 실패해도 기존 컨텍스트를 유지한다."""
    try:
        ctx = await asyncio.wait_for(
            asyncio.to_thread(api.resolve_tenant, to_number), timeout=timeout_s
        )
    except (ColliApiError, asyncio.TimeoutError, Exception) as e:
        log.warning(
            "테넌트 컨텍스트 갱신 실패(%s): %s — 기존 컨텍스트(%s)로 계속",
            reason or "refresh",
            e,
            state.prompt_source,
        )
        return False
    prompt, source = extract_system_prompt(ctx)
    state.context = ctx
    state.system_prompt = prompt
    state.prompt_source = source
    state.tenant_id = (ctx.get("tenant") or {}).get("tenantId")
    tenant_name = (ctx.get("tenant") or {}).get("name")
    log.info(
        "테넌트 컨텍스트 갱신(%s): tenant=%s prompt_source=%s prompt_len=%d",
        reason or "refresh",
        tenant_name,
        source,
        len(prompt),
    )
    return True


# ── 에이전트 조립 ────────────────────────────────────────────────


def build_agent(state: GatewayState, api: ColliApiClient, to_number: str):
    """ClawOpsAgent + 이벤트 핸들러 + tool 을 조립한다(연결은 하지 않음)."""
    from clawops.agent import ClawOpsAgent, OpenAIRealtime

    realtime = OpenAIRealtime(
        system_prompt=state.system_prompt,
        voice="marin",
        language="ko",
    )
    agent = ClawOpsAgent(
        from_=to_number,
        session=realtime,
        recording=True,
        recording_path=os.path.join(_HERE, "recordings"),
    )

    def apply_prompt_to_session() -> None:
        """state.system_prompt 를 다음 session.update 에 반영한다.

        clawops 0.31.0: OpenAIRealtime._config(OpenAIRealtimeConfig, non-frozen
        dataclass).system_prompt 를 prewarm()/start() 시점에 읽는다. SDK 업그레이드로
        내부 구조가 바뀌면 경고만 남기고 구성 시점 프롬프트로 계속 동작한다.
        """
        try:
            realtime._config.system_prompt = state.system_prompt  # noqa: SLF001
        except AttributeError:
            log.warning(
                "SDK 내부 구조 변경으로 system_prompt 동적 갱신 실패 — "
                "구성 시점 프롬프트로 응대합니다(clawops 버전 확인 필요)."
            )

    async def _register_call(rec: dict[str, Any], call) -> None:
        try:
            rec["ingest_id"] = await asyncio.to_thread(
                lambda: api.ingest_call_start(
                    clawops_call_id=call.call_id,
                    to_number=call.to_number,
                    from_number=call.from_number,
                    started_at=utcnow_iso(),
                )
            )
            log.info(
                "ingest 등록: clawopsCallId=%s → callSessionId=%s",
                call.call_id,
                rec["ingest_id"],
            )
        except Exception as e:
            log.warning("ingest 통화 등록 실패(통화는 계속): %s", e)

    async def _await_registration(rec: dict[str, Any]) -> None:
        task = rec.get("register_task")
        if task is not None:
            try:
                await task
            except Exception:
                pass

    @agent.on("call_start")
    async def on_call_start(call) -> None:
        log.info("[통화 시작] %s -> %s (%s)", call.from_number, call.to_number, call.call_id)
        # 1) 최신 테넌트 설정 반영 — 이 await 는 SDK 가 session.start() 이전에
        #    순차 실행하므로, 여기서 갱신한 프롬프트가 이번 통화에 적용된다.
        await refresh_context(state, api, to_number, reason="call_start")
        apply_prompt_to_session()

        # 2) 통화 기록 등록(멱등) — 백그라운드로, greeting 을 지연시키지 않는다.
        rec: dict[str, Any] = {"t0": time.monotonic(), "ingest_id": None, "register_task": None}
        state.calls[call.call_id] = rec
        state.current_call_id = call.call_id
        rec["register_task"] = asyncio.create_task(_register_call(rec, call))

    @agent.on("transcript")
    async def on_transcript(call, role: str, text: str) -> None:
        log.info("[%s] %s", role, text)
        rec = state.calls.get(call.call_id)
        if rec is None or not text.strip():
            return
        start_ms = max(0.0, (time.monotonic() - rec["t0"]) * 1000)
        # OpenAI Realtime 이벤트 role(user/assistant) → ingest 계약 role(caller/agent)
        ingest_role = {"user": "caller", "assistant": "agent"}.get(role)
        if ingest_role is None:
            return
        try:
            await _await_registration(rec)
            if not rec.get("ingest_id"):
                return  # 등록 실패 — transcript ingest 스킵(로그는 등록 시점에 남음)
            await asyncio.to_thread(
                lambda: api.ingest_transcript(
                    rec["ingest_id"], role=ingest_role, text=text, start_ms=start_ms
                )
            )
        except Exception as e:
            log.warning("transcript ingest 실패(통화는 계속): %s", e)

    @agent.on("call_end")
    async def on_call_end(call) -> None:
        log.info("[통화 종료] %s duration=%.1fs", call.call_id, call.duration)
        rec = state.calls.pop(call.call_id, None)
        if state.current_call_id == call.call_id:
            state.current_call_id = None
        if rec is not None:
            try:
                await _await_registration(rec)
                if rec.get("ingest_id"):
                    await asyncio.to_thread(
                        api.ingest_complete,
                        rec["ingest_id"],
                        ended_at=utcnow_iso(),
                        duration_sec=call.duration,
                    )
            except Exception as e:
                log.warning("통화 완료 ingest 실패: %s", e)
        # 다음 통화 대비 워밍 리로드(보험) — call_start refetch 가 실패해도
        # 직전 통화 종료 시점의 설정으로는 응대할 수 있게 한다.
        asyncio.create_task(refresh_context(state, api, to_number, reason="post_call"))

    @agent.tool
    async def get_kb_answer(query: str) -> str:
        """사장님이 콘솔에 등록한 지식베이스(자주 묻는 질문)에서 답변을 검색한다. 사용법·요금·영업시간 등 일반 문의에 사용."""
        try:
            envelope = await asyncio.to_thread(
                api.invoke_tool,
                "get_kb_answer",
                {"query": query},
                tenant_id=state.tenant_id,
                call_session_id=state.current_call_id,
            )
        except Exception as e:
            log.warning("get_kb_answer 프록시 실패: %s", e)
            return (
                "지식베이스 검색 중 오류가 발생했습니다. 확인 후 다시 연락드리겠다고 "
                "정중히 안내하세요."
            )
        if envelope.get("ok"):
            data = envelope.get("data") or {}
            answer = data.get("answer") if isinstance(data, dict) else None
            if answer:
                confidence = data.get("confidence")
                suffix = (
                    f" (confidence={confidence})" if isinstance(confidence, (int, float)) else ""
                )
                return f"{answer}{suffix}"
            return "지식베이스에서 해당 질문의 답을 찾지 못했습니다. 확인 후 연락드리겠다고 안내하세요."
        err = envelope.get("error") or {}
        log.warning("get_kb_answer tool 오류: %s", err)
        return (
            "지식베이스에서 답을 찾지 못했습니다. 무리하게 답하지 말고 확인 후 "
            "연락드리겠다고 안내하세요."
        )

    return agent


# ── 진입점 ───────────────────────────────────────────────────────


def run_check(state: GatewayState, api: ColliApiClient, to_number: str | None) -> int:
    """--check: 연결 전 단계(env → resolve → 프롬프트)만 점검하고 종료한다.

    종료 코드: 0=정상, 1=필수 env 누락, 2=apps/api resolve 실패(미기동 등).
    """
    print("=== voice-gateway --check ===")
    required = ["CLAWOPS_API_KEY", "CLAWOPS_ACCOUNT_ID", "CLAWOPS_070_NUMBER", "OPENAI_API_KEY"]
    missing = [k for k in required if not os.environ.get(k)]
    for key in required:
        print(f"  env {key}: {'SET' if os.environ.get(key) else 'MISSING'}")
    print(f"  env API_BASE_URL: {api.base_url}")
    print(f"  env GATEWAY_SHARED_SECRET: {'SET' if api.gateway_secret else 'MISSING'}")
    if missing:
        print(f"FAIL: 필수 환경변수 누락: {', '.join(missing)}")
        return 1

    assert to_number is not None
    try:
        ctx = api.resolve_tenant(to_number)
    except ColliApiError as e:
        print(f"FAIL: resolve 실패({e.code}): {e}")
        print("  apps/api 가 떠 있는지 확인하세요 (기본 http://localhost:3001).")
        return 2

    prompt, source = extract_system_prompt(ctx)
    tenant = ctx.get("tenant") or {}
    print(f"  resolve OK: tenant={tenant.get('name')} ({tenant.get('slug')}) status={tenant.get('status')}")
    print(f"  intents={len(ctx.get('intents') or [])} toolSchemas={len(ctx.get('toolSchemas') or [])}")
    print(f"  systemPrompt source={source} length={len(prompt)}")
    if source == "fallback":
        print("  주의: resolve 응답에 systemPrompt 가 없어 임시 폴백 프롬프트를 사용합니다.")
    print("OK: 연결 전 단계 점검 통과 (ClawOps 연결은 수행하지 않음)")
    return 0


async def main_serve(state: GatewayState, api: ColliApiClient, to_number: str) -> None:
    # 기동 시 초기 컨텍스트 로드(실패해도 SAFE_BOOT_PROMPT 로 대기 — 매 통화마다 재시도됨).
    await refresh_context(state, api, to_number, timeout_s=10.0, reason="boot")
    agent = build_agent(state, api, to_number)
    log.info(
        "콜비 voice-gateway 대기 중: number=%s api=%s prompt_source=%s",
        to_number,
        api.base_url,
        state.prompt_source,
    )
    await agent.serve()


def main() -> int:
    parser = argparse.ArgumentParser(description="콜비 ClawOps voice gateway")
    parser.add_argument(
        "--check",
        action="store_true",
        help="연결 전 단계(env/resolve/프롬프트)만 점검하고 종료",
    )
    args = parser.parse_args()

    base_url = os.environ.get("API_BASE_URL", "http://localhost:3001")
    secret = os.environ.get("GATEWAY_SHARED_SECRET", "dev-gateway-secret")
    to_number = os.environ.get("CLAWOPS_070_NUMBER")

    api = ColliApiClient(base_url, gateway_secret=secret)
    state = GatewayState()

    if args.check:
        return run_check(state, api, to_number)

    if not to_number:
        log.error("CLAWOPS_070_NUMBER 환경변수가 필요합니다 (.env 확인).")
        return 1

    asyncio.run(main_serve(state, api, to_number))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
