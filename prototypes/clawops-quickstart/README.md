# ClawOps 퀵스타트 프로토타입 (별도 실험)

Colli-BoBi 메인 워크스페이스(`/apps/voice`, TS)와는 **독립적인 프로토타입**입니다.
실제 ClawOps Python SDK + OpenAI Realtime 로 070 인바운드 통화가 동작하는지 빠르게 검증하는 용도.
검증되면 이 흐름을 `/apps/voice`(계약 기반 어댑터)로 이식합니다.

## 실행

```bash
cd /Users/seungsoohan/Projects/CallBee/prototypes/clawops-quickstart
source .venv/bin/activate
python agent.py
```

"연결 대기 중..." 로그가 뜨면 070 **07052361037** 번호로 전화를 걸어 테스트하세요.

## 상태

- [x] venv + `clawops[agent,openai]` 설치 완료
- [x] `.env` 에 `CLAWOPS_API_KEY`/`CLAWOPS_ACCOUNT_ID` 설정됨
- [ ] `OPENAI_API_KEY` — 아직 미입력 (agent.py 실행 전 `.env` 에 채워야 함)
- [ ] 실통화 테스트

## 결과 확인

통화 종료 후 ClawOps MCP 도구로 확인:
```
list_calls → get_call / get_transcript / get_call_summary
```
(MCP `clawops` 서버는 이미 로컬 config 에 등록됨 — 사용자가 `/reload-plugins` 후 `/mcp` 로 인증 필요)
