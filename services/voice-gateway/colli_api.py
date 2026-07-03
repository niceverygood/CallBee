"""apps/api HTTP 클라이언트 — 표준 라이브러리만 사용한다(단위 테스트 용이).

동기(블로킹) 클라이언트다. gateway.py 는 모든 호출을 asyncio.to_thread 로
감싸 실행해 통화 오디오 이벤트 루프를 블로킹하지 않는다.

응답 봉투 규약(apps/api): {ok:true,data} | {ok:false,error:{code,message}}.
- resolve/ingest 계열은 봉투를 벗겨(data) 반환하고 실패 시 ColliApiError.
- invoke_tool 은 봉투 전체(ToolInvocationResult)를 그대로 반환한다 —
  tool 실패는 통화를 깨지 않고 LLM 에게 문자열로 전달해야 하기 때문.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

DEFAULT_BASE_URL = "http://localhost:3001"
DEFAULT_GATEWAY_SECRET = "dev-gateway-secret"
DEFAULT_TIMEOUT_S = 5.0

GATEWAY_SECRET_HEADER = "x-gateway-secret"
TENANT_ID_HEADER = "x-tenant-id"
CALL_SESSION_ID_HEADER = "x-call-session-id"


class ColliApiError(Exception):
    """apps/api 호출 실패(연결/HTTP/봉투 ok:false 모두 포함)."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "api_error",
        status: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


class ColliApiClient:
    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        *,
        gateway_secret: str = DEFAULT_GATEWAY_SECRET,
        timeout_s: float = DEFAULT_TIMEOUT_S,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.gateway_secret = gateway_secret
        self.timeout_s = timeout_s

    # ── 공용 HTTP ────────────────────────────────────────────────

    def _request(
        self,
        method: str,
        path: str,
        *,
        body: dict[str, Any] | None = None,
        headers: dict[str, str | None] | None = None,
    ) -> Any:
        url = self.base_url + path
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Accept", "application/json")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        for key, value in (headers or {}).items():
            if value:
                req.add_header(key, value)

        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                raw = resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            # HTTP 4xx/5xx 라도 봉투(ok:false)면 error.code/message 를 살려서 던진다.
            try:
                raw_err = e.read().decode("utf-8")
                parsed_err = json.loads(raw_err)
            except Exception:
                parsed_err = None
            if isinstance(parsed_err, dict) and parsed_err.get("ok") is False:
                err = parsed_err.get("error") or {}
                raise ColliApiError(
                    str(err.get("message", f"HTTP {e.code}")),
                    code=str(err.get("code", "api_error")),
                    status=e.code,
                ) from e
            raise ColliApiError(
                f"HTTP {e.code} {method} {path}", code="http_error", status=e.code
            ) from e
        except urllib.error.URLError as e:
            raise ColliApiError(
                f"connection failed: {getattr(e, 'reason', e)}",
                code="connection_error",
            ) from e

        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            raise ColliApiError(
                f"invalid JSON response from {method} {path}", code="invalid_response"
            ) from e

    @staticmethod
    def _unwrap(parsed: Any, *, context: str) -> Any:
        """{ok:true,data}|{ok:false,error} 봉투를 벗긴다."""
        if not isinstance(parsed, dict) or "ok" not in parsed:
            raise ColliApiError(
                f"unexpected response shape from {context}", code="invalid_response"
            )
        if parsed.get("ok") is not True:
            err = parsed.get("error") or {}
            raise ColliApiError(
                str(err.get("message", "unknown error")),
                code=str(err.get("code", "api_error")),
            )
        return parsed.get("data")

    def _ingest_headers(self) -> dict[str, str | None]:
        return {GATEWAY_SECRET_HEADER: self.gateway_secret}

    # ── 테넌트 resolve ───────────────────────────────────────────

    def resolve_tenant(self, to_number: str) -> dict[str, Any]:
        """GET /tenants/resolve?toNumber=... → ResolvedTenantAgentContext(dict)."""
        query = urllib.parse.urlencode({"toNumber": to_number})
        parsed = self._request("GET", f"/tenants/resolve?{query}")
        data = self._unwrap(parsed, context="GET /tenants/resolve")
        if not isinstance(data, dict):
            raise ColliApiError(
                "resolve returned non-object data", code="invalid_response"
            )
        return data

    # ── 통화 기록 ingest (x-gateway-secret 필수) ─────────────────

    def ingest_call_start(
        self, *, clawops_call_id: str, to_number: str, from_number: str, started_at: str
    ) -> str:
        """POST /ingest/calls (clawopsCallId 멱등). 서버의 callSessionId 를 반환한다.

        서버(apps/api ingest.controller.ts)가 toNumber 로 테넌트를 스스로 resolve
        하므로 tenantId 는 보내지 않는다.
        """
        payload = {
            "clawopsCallId": clawops_call_id,
            "toNumber": to_number,
            "fromNumber": from_number,
            "startedAt": started_at,
        }
        parsed = self._request(
            "POST", "/ingest/calls", body=payload, headers=self._ingest_headers()
        )
        data = self._unwrap(parsed, context="POST /ingest/calls")
        if isinstance(data, dict) and data.get("callSessionId"):
            return str(data["callSessionId"])
        raise ColliApiError(
            "ingest call registration returned no callSessionId",
            code="invalid_response",
        )

    def ingest_transcript(
        self, call_session_id: str, *, role: str, text: str, start_ms: float
    ) -> Any:
        """POST /ingest/calls/{callSessionId}/transcripts — 발화 1건 추가.

        role 은 서버 계약상 "caller" | "agent" 만 허용된다(SPEAKER_ROLES 하위 2종).
        """
        body = {"role": role, "text": text, "startMs": int(round(float(start_ms)))}
        parsed = self._request(
            "POST",
            f"/ingest/calls/{urllib.parse.quote(call_session_id, safe='')}/transcripts",
            body=body,
            headers=self._ingest_headers(),
        )
        return self._unwrap(
            parsed, context="POST /ingest/calls/{callSessionId}/transcripts"
        )

    def ingest_complete(
        self, call_session_id: str, *, ended_at: str, duration_sec: float
    ) -> Any:
        """POST /ingest/calls/{callSessionId}/complete — 통화 세션 마감."""
        body = {"endedAt": ended_at, "durationSec": int(round(duration_sec))}
        parsed = self._request(
            "POST",
            f"/ingest/calls/{urllib.parse.quote(call_session_id, safe='')}/complete",
            body=body,
            headers=self._ingest_headers(),
        )
        return self._unwrap(
            parsed, context="POST /ingest/calls/{callSessionId}/complete"
        )

    # ── tool 프록시 ──────────────────────────────────────────────

    def invoke_tool(
        self,
        name: str,
        params: dict[str, Any],
        *,
        tenant_id: str | None = None,
        call_session_id: str | None = None,
    ) -> dict[str, Any]:
        """POST /tools/{name} — ToolInvocationResult 봉투를 그대로 반환한다."""
        headers: dict[str, str | None] = {
            TENANT_ID_HEADER: tenant_id,
            CALL_SESSION_ID_HEADER: call_session_id,
        }
        parsed = self._request(
            "POST",
            f"/tools/{urllib.parse.quote(name, safe='')}",
            body=params,
            headers=headers,
        )
        if not isinstance(parsed, dict):
            raise ColliApiError(
                f"unexpected response shape from POST /tools/{name}",
                code="invalid_response",
            )
        return parsed
