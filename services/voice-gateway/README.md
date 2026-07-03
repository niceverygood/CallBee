# 콜비 voice-gateway

ClawOps 070 인바운드 통화를 **그 순간의 테넌트 설정**(웹 콘솔에서 커스텀한
인사말/페르소나/지식베이스)으로 응대하고, 통화 기록을 apps/api 로 ingest 해
콘솔에 쌓이게 하는 Python 게이트웨이.

- 검증된 프로토타입(`prototypes/clawops-quickstart/agent.py`)의 실통화 경로를
  그대로 쓰되, 하드코딩 프롬프트를 `GET /tenants/resolve?toNumber=...` 기반
  동적 프롬프트로 교체했다.
- ClawOps Individual 플랜(동시통화 1 · 번호 1개) 기준 단일 프로세스로 충분하다.
  번호가 늘어나도 resolve-by-toNumber 구조라 그대로 확장된다.

## 동작

| 시점 | 동작 |
|---|---|
| 기동 | resolve 로 초기 테넌트 컨텍스트 로드 → `OpenAIRealtime(system_prompt=...)` 구성 |
| 매 통화 시작(`call_start`) | 컨텍스트 refetch(2.5s 한도) → 세션 프롬프트 갱신. SDK 가 `call_start` 핸들러를 `session.start()` **이전에** await 하고, OpenAI Realtime WS 는 통화마다 새로 열리며 그 시점의 `system_prompt` 를 읽으므로 **이번 통화부터 즉시 적용**된다. refetch 실패 시 직전 컨텍스트로 응대 |
| 통화 중 | `POST /ingest/calls`(멱등, call_start) → 발화마다 `POST /ingest/calls/{id}/transcripts` → 종료 시 `.../complete`. 전부 try/except — ingest 실패는 통화를 깨지 않는다 |
| tool | `get_kb_answer` 를 apps/api `POST /tools/get_kb_answer` 로 프록시(`x-tenant-id`, `x-call-session-id` 헤더) — 콘솔의 "자주 묻는 질문"이 통화 응답으로 연결된다 |

ingest 호출에는 `x-gateway-secret: $GATEWAY_SHARED_SECRET` 헤더가 붙는다.

프롬프트는 resolve 응답의 `systemPrompt`(@colli/dialogue `buildTenantSystemPrompt`
산출물)를 그대로 쓴다. 아직 응답에 없으면(병렬 작업 중) `greetingText +
personaInstructions` 만으로 최소 임시 프롬프트를 조립한다 — 프롬프트 조립 로직을
여기에 복제하지 않는다(가드레일 단일 소스 원칙).

## 설치

```bash
cd /Users/seungsoohan/Projects/CallBee/services/voice-gateway
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env   # 실값 채우기 (루트 .env / prototypes/clawops-quickstart/.env 참조)
```

## 실행

```bash
cd /Users/seungsoohan/Projects/CallBee/services/voice-gateway
.venv/bin/python gateway.py --check   # 연결 전 단계 점검(env/resolve/프롬프트)
.venv/bin/python gateway.py           # 인바운드 대기 (Ctrl-C 로 종료)
```

`--check` 종료 코드: `0` 정상 · `1` 필수 env 누락 · `2` apps/api resolve 실패(미기동 등).
apps/api 는 `pnpm --filter @colli/api dev`(기본 :3001)로 먼저 띄운다.

## 테스트 (실통화 불필요)

```bash
cd /Users/seungsoohan/Projects/CallBee/services/voice-gateway
.venv/bin/python -m unittest discover -s tests -v
```

`colli_api.py` 는 표준 라이브러리 전용 HTTP 클라이언트라 로컬 목 `http.server`
만으로 resolve 봉투 파싱·ingest 경로/페이로드·시크릿 헤더를 검증한다.

## 파일

- `gateway.py` — 메인. ClawOpsAgent 조립, call_start 프롬프트 갱신, ingest, `--check`
- `colli_api.py` — apps/api HTTP 클라이언트(stdlib 전용, 동기 — gateway 가 `asyncio.to_thread` 로 감쌈)
- `tests/test_colli_api.py` — 단위 테스트
- `.env.example` / `requirements.txt` / `.gitignore`
