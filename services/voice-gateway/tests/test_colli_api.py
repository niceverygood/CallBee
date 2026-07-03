"""colli_api.ColliApiClient 단위 테스트 — 표준 라이브러리만 사용.

로컬 http.server 목으로 실제 HTTP 왕복을 검증한다:
- resolve 봉투 파싱({ok:true,data} / {ok:false,error})
- ingest 경로/페이로드/x-gateway-secret 헤더
- tool 프록시의 x-tenant-id / x-call-session-id 헤더

실행:
  cd services/voice-gateway
  .venv/bin/python -m unittest discover -s tests -v
"""

from __future__ import annotations

import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from colli_api import (  # noqa: E402
    CALL_SESSION_ID_HEADER,
    GATEWAY_SECRET_HEADER,
    TENANT_ID_HEADER,
    ColliApiClient,
    ColliApiError,
)


class _MockApiHandler(BaseHTTPRequestHandler):
    """요청을 기록하고, 테스트가 지정한 응답을 돌려주는 목 서버 핸들러."""

    # 클래스 변수 — 각 테스트 setUp 에서 초기화된다.
    requests: list[dict] = []
    responses: dict[str, tuple[int, dict]] = {}  # "METHOD path" → (status, body)

    def _handle(self, method: str) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else ""
        record = {
            "method": method,
            "path": self.path,
            "headers": {k.lower(): v for k, v in self.headers.items()},
            "body": json.loads(raw) if raw else None,
        }
        type(self).requests.append(record)

        key = f"{method} {self.path}"
        status, body = type(self).responses.get(
            key, (404, {"ok": False, "error": {"code": "not_found", "message": key}})
        )
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802
        self._handle("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._handle("POST")

    def log_message(self, *args) -> None:  # 테스트 출력 소음 제거
        pass


class ColliApiClientTest(unittest.TestCase):
    server: ThreadingHTTPServer
    thread: threading.Thread

    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), _MockApiHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    def setUp(self) -> None:
        _MockApiHandler.requests = []
        _MockApiHandler.responses = {}
        self.client = ColliApiClient(
            self.base_url, gateway_secret="test-secret", timeout_s=3.0
        )

    # ── resolve ──────────────────────────────────────────────────

    def test_resolve_tenant_parses_ok_envelope(self) -> None:
        ctx = {
            "tenant": {"tenantId": "t-1", "name": "테스트상점"},
            "agentConfig": {"serviceName": "테스트상점", "agentName": "콜비"},
            "intents": [],
            "toolSchemas": [],
            "systemPrompt": "PROMPT",
        }
        _MockApiHandler.responses["GET /tenants/resolve?toNumber=07012345678"] = (
            200,
            {"ok": True, "data": ctx},
        )

        result = self.client.resolve_tenant("07012345678")

        self.assertEqual(result, ctx)
        req = _MockApiHandler.requests[0]
        self.assertEqual(req["method"], "GET")
        self.assertEqual(req["path"], "/tenants/resolve?toNumber=07012345678")

    def test_resolve_tenant_raises_on_error_envelope(self) -> None:
        _MockApiHandler.responses["GET /tenants/resolve?toNumber=07000000000"] = (
            200,
            {"ok": False, "error": {"code": "tenant_not_found", "message": "no tenant"}},
        )

        with self.assertRaises(ColliApiError) as caught:
            self.client.resolve_tenant("07000000000")
        self.assertEqual(caught.exception.code, "tenant_not_found")

    def test_http_500_raises_api_error(self) -> None:
        _MockApiHandler.responses["GET /tenants/resolve?toNumber=07011112222"] = (
            500,
            {"boom": True},
        )

        with self.assertRaises(ColliApiError) as caught:
            self.client.resolve_tenant("07011112222")
        self.assertEqual(caught.exception.status, 500)

    def test_connection_error_raises_api_error(self) -> None:
        dead = ColliApiClient("http://127.0.0.1:1", timeout_s=0.5)
        with self.assertRaises(ColliApiError) as caught:
            dead.resolve_tenant("07012345678")
        self.assertEqual(caught.exception.code, "connection_error")

    # ── ingest ───────────────────────────────────────────────────

    def test_ingest_call_start_sends_secret_and_returns_call_session_id(self) -> None:
        _MockApiHandler.responses["POST /ingest/calls"] = (
            200,
            {"ok": True, "data": {"callSessionId": "cs-1"}},
        )

        ingest_id = self.client.ingest_call_start(
            clawops_call_id="co-123",
            to_number="07052361037",
            from_number="+821012345678",
            started_at="2026-07-03T00:00:00Z",
        )

        self.assertEqual(ingest_id, "cs-1")
        req = _MockApiHandler.requests[0]
        self.assertEqual(req["path"], "/ingest/calls")
        self.assertEqual(req["headers"][GATEWAY_SECRET_HEADER], "test-secret")
        self.assertEqual(req["headers"]["content-type"], "application/json")
        self.assertEqual(
            req["body"],
            {
                "clawopsCallId": "co-123",
                "toNumber": "07052361037",
                "fromNumber": "+821012345678",
                "startedAt": "2026-07-03T00:00:00Z",
            },
        )

    def test_ingest_call_start_without_session_id_raises(self) -> None:
        _MockApiHandler.responses["POST /ingest/calls"] = (200, {"ok": True, "data": {}})

        with self.assertRaises(ColliApiError) as caught:
            self.client.ingest_call_start(
                clawops_call_id="co-999",
                to_number="07052361037",
                from_number="+821012345678",
                started_at="2026-07-03T00:00:00Z",
            )
        self.assertEqual(caught.exception.code, "invalid_response")

    def test_ingest_transcript_path_payload_and_secret(self) -> None:
        _MockApiHandler.responses["POST /ingest/calls/cs-1/transcripts"] = (
            200,
            {"ok": True, "data": {"transcriptId": "tr-1"}},
        )

        self.client.ingest_transcript(
            "cs-1", role="caller", text="영업시간이 어떻게 되나요?", start_ms=12340.7
        )

        req = _MockApiHandler.requests[0]
        self.assertEqual(req["path"], "/ingest/calls/cs-1/transcripts")
        self.assertEqual(req["headers"][GATEWAY_SECRET_HEADER], "test-secret")
        self.assertEqual(
            req["body"],
            {"role": "caller", "text": "영업시간이 어떻게 되나요?", "startMs": 12341},
        )

    def test_ingest_complete_path_and_payload(self) -> None:
        _MockApiHandler.responses["POST /ingest/calls/cs-1/complete"] = (
            200,
            {"ok": True, "data": {"callSessionId": "cs-1", "completed": True}},
        )

        self.client.ingest_complete(
            "cs-1", ended_at="2026-07-03T00:01:00Z", duration_sec=59.6
        )

        req = _MockApiHandler.requests[0]
        self.assertEqual(req["path"], "/ingest/calls/cs-1/complete")
        self.assertEqual(req["headers"][GATEWAY_SECRET_HEADER], "test-secret")
        self.assertEqual(
            req["body"], {"endedAt": "2026-07-03T00:01:00Z", "durationSec": 60}
        )

    def test_ingest_error_envelope_raises(self) -> None:
        _MockApiHandler.responses["POST /ingest/calls"] = (
            401,
            {"ok": False, "error": {"code": "unauthorized", "message": "nope"}},
        )

        with self.assertRaises(ColliApiError) as caught:
            self.client.ingest_call_start(
                clawops_call_id="co-1",
                to_number="07052361037",
                from_number="+821012345678",
                started_at="2026-07-03T00:00:00Z",
            )
        self.assertEqual(caught.exception.code, "unauthorized")

    # ── tool 프록시 ──────────────────────────────────────────────

    def test_invoke_tool_sends_tenant_headers_and_returns_envelope(self) -> None:
        _MockApiHandler.responses["POST /tools/get_kb_answer"] = (
            200,
            {
                "ok": True,
                "tool": "get_kb_answer",
                "data": {"answer": "평일 10시~19시입니다.", "sourceId": "kb-1", "confidence": 0.92},
            },
        )

        envelope = self.client.invoke_tool(
            "get_kb_answer",
            {"query": "영업시간"},
            tenant_id="t-1",
            call_session_id="co-123",
        )

        self.assertTrue(envelope["ok"])
        self.assertEqual(envelope["data"]["answer"], "평일 10시~19시입니다.")
        req = _MockApiHandler.requests[0]
        self.assertEqual(req["path"], "/tools/get_kb_answer")
        self.assertEqual(req["headers"][TENANT_ID_HEADER], "t-1")
        self.assertEqual(req["headers"][CALL_SESSION_ID_HEADER], "co-123")
        self.assertNotIn(GATEWAY_SECRET_HEADER, req["headers"])  # tool 경로엔 시크릿 미전송
        self.assertEqual(req["body"], {"query": "영업시간"})

    def test_invoke_tool_returns_error_envelope_without_raising(self) -> None:
        _MockApiHandler.responses["POST /tools/get_kb_answer"] = (
            200,
            {
                "ok": False,
                "tool": "get_kb_answer",
                "error": {"code": "kb_empty", "message": "no kb"},
            },
        )

        envelope = self.client.invoke_tool("get_kb_answer", {"query": "x"}, tenant_id="t-1")

        self.assertFalse(envelope["ok"])
        self.assertEqual(envelope["error"]["code"], "kb_empty")


if __name__ == "__main__":
    unittest.main()
