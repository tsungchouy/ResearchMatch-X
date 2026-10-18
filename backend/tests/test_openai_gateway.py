import asyncio
import json

import httpx2
import pytest
from openai import AsyncOpenAI

from app.config import Settings
from app.errors import AppError
from app.services.openai_client import OpenAIGateway
from app.services.profile import ExtractedProfile

from .openai_stub import respond


def make_gateway(handler) -> tuple[OpenAIGateway, list[dict]]:
    requests: list[dict] = []

    def wrapped(request: httpx2.Request) -> httpx2.Response:
        body = json.loads(request.content)
        requests.append(body)
        status, payload = handler(body)
        return httpx2.Response(status, json=payload)

    gateway = OpenAIGateway(Settings(openai_api_key="test", openai_model="stub-model"))
    gateway.client = AsyncOpenAI(
        api_key="test",
        max_retries=0,
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(wrapped)),
    )
    return gateway, requests


def test_web_search_request_shape_and_source_parsing():
    gateway, requests = make_gateway(respond)
    gateway.reasoning = {"effort": "low"}
    result = asyncio.run(gateway.web_search(instructions="find", input="interests", domain="cmu.edu"))
    request = requests[0]
    assert request["tools"] == [{"type": "web_search", "filters": {"allowed_domains": ["cmu.edu"]}}]
    assert request["include"] == ["web_search_call.action.sources"]
    assert request["tool_choice"] == "required"
    assert request["reasoning"] == {"effort": "low"}
    assert result.search_call_count == 1
    urls = [s.url for s in result.sources]
    assert "https://www.cs.cmu.edu/~stub-lin" in urls
    assert "https://www.cs.cmu.edu/~stub-lin/join" in urls
    titled = {s.url: s.title for s in result.sources}
    assert titled["https://www.cs.cmu.edu/~stub-lin"].endswith("faculty page")
    assert result.response_id == "resp_stub"
    assert result.usage["total_tokens"] == 20


def test_structured_output_uses_strict_schema():
    gateway, requests = make_gateway(respond)
    profile = asyncio.run(
        gateway.structured(instructions="x", input="<data>cv</data>", model=ExtractedProfile, name="student_profile")
    )
    fmt = requests[0]["text"]["format"]
    assert fmt["type"] == "json_schema" and fmt["strict"] is True
    assert fmt["schema"]["additionalProperties"] is False
    assert profile.major == "Computer Science"


def test_structured_output_repairs_once_then_fails():
    calls = {"n": 0}

    def bad(body):
        calls["n"] += 1
        return 200, {
            "id": "r", "object": "response", "created_at": 0, "model": "m", "status": "completed",
            "parallel_tool_calls": True, "tool_choice": "auto", "tools": [],
            "output": [{"type": "message", "id": "m", "role": "assistant", "status": "completed",
                        "content": [{"type": "output_text", "text": "{not json", "annotations": []}]}],
        }

    gateway, _ = make_gateway(bad)
    with pytest.raises(AppError) as info:
        asyncio.run(gateway.structured(instructions="x", input="y", model=ExtractedProfile, name="student_profile"))
    assert info.value.code == "INVALID_MODEL_OUTPUT"
    assert calls["n"] == 2


def test_provider_errors_are_mapped_without_details():
    gateway, _ = make_gateway(lambda body: (401, {"error": {"message": "bad key sk-123", "type": "invalid_api_key"}}))
    with pytest.raises(AppError) as info:
        asyncio.run(gateway.web_search(instructions="x", input="y", domain="cmu.edu"))
    assert info.value.code == "LIVE_AUTH_FAILED"
    assert "sk-123" not in info.value.message
