"""
Colli-BoBi — ClawOps 음성 에이전트 프로토타입 (별도 실험, apps/voice 와 무관).

목적: 실제 ClawOps SDK + OpenAI Realtime 로 070 인바운드 통화가 실제로 동작하는지
빠르게 검증한다. 검증되면 이 흐름을 apps/voice(TS, 계약 기반 어댑터)에 이식한다.
"""

import asyncio
import os

import certifi

# python.org macOS 빌드는 시스템 CA 번들을 못 찾는 경우가 있어(SSLCertVerificationError),
# certifi 번들을 명시적으로 지정한다. clawops/aiohttp import 전에 설정해야 한다.
os.environ.setdefault("SSL_CERT_FILE", certifi.where())

from dotenv import load_dotenv

from clawops.agent import ClawOpsAgent, OpenAIRealtime

load_dotenv()

SYSTEM_PROMPT = """\
당신은 BoBi(보험설계사용 SaaS) 고객센터의 AI 상담원 "콜비"입니다.

톤: 친절하고 간결하게, 한 번에 하나의 질문만 합니다. 이름·전화번호·날짜는 반드시 복창해 확인합니다.
복창한 내용을 상대가 정정하면 그냥 넘어가지 말고 정정된 내용으로 즉시 다시 복창해 재확인합니다.

통화가 연결되면 다른 어떤 말보다 먼저 이렇게 짧게 인사합니다:
"안녕하세요, BoBi 고객센터의 AI 상담원 콜비입니다."
그 다음 바로 이어서 "AI가 응대하며 통화가 녹음됩니다"라고 고지하세요.

문의는 다음 중 하나로 분류해 응대합니다:
- 사용법: 아는 범위에서 간단히 안내합니다.
- 결제: 카드번호·계좌번호·CVC 등 결제수단 정보는 절대 음성으로 묻거나 받지 않습니다.
  결제 변경은 반드시 셀프서비스 링크(문자/알림톡)로 안내한다고만 말하세요.
- 기술오류: 증상을 한두 문장으로 요약해 담당팀에 전달하겠다고 안내하세요.
- 요금제 변경/해지/신규가입: 담당자 연결 또는 콜백을 안내하세요.
- 보험상품 추천·가입 판단·진단성 질문: BoBi 상담원은 보험상품에 대해 조언하지 않으며,
  정중히 담당자에게 인계한다고 안내하세요.

같은 의도를 2번 이상 파악하지 못하면 억지로 반복하지 말고 콜백을 예약하겠다고 안내하세요.
"""


agent = ClawOpsAgent(
    from_="07052361037",
    session=OpenAIRealtime(
        system_prompt=SYSTEM_PROMPT,
        voice="marin",
        language="ko",
    ),
    recording=True,
)


@agent.on("call_start")
async def on_start(call):
    print(f"[통화 시작] {call.from_number} -> {call.to_number}")


@agent.on("call_end")
async def on_end(call):
    print(f"[통화 종료] duration={call.duration:.1f}s")


@agent.on("transcript")
async def on_transcript(call, role, text):
    print(f"[{role}] {text}")


@agent.tool
async def get_kb_answer(query: str) -> str:
    """BoBi 사용법에 대한 자주 묻는 질문에 답한다(프로토타입: 정적 목 응답)."""
    return f"'{query}' 에 대한 답변은 준비 중입니다. 정식 서비스에서는 지식베이스를 검색합니다."


if __name__ == "__main__":
    print("콜비(Colli-BoBi) ClawOps 프로토타입 — 연결 대기 중...")
    asyncio.run(agent.serve())
