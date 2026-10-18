"""Stand-in for the OpenAI API used by the Live-mode Playwright tests.

Run: uvicorn tests.stub_openai_server:app --port 8765
Then start the backend with OPENAI_BASE_URL=http://127.0.0.1:8765/v1.
STUB_FAIL_DOMAINS=stanford.edu makes searches for that domain fail.
"""

from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .openai_stub import respond

FAIL_DOMAINS = {domain.strip() for domain in os.getenv("STUB_FAIL_DOMAINS", "").split(",") if domain.strip()}

app = FastAPI(title="OpenAI stub (tests only)")


@app.post("/v1/responses")
async def responses(request: Request) -> JSONResponse:
    status, payload = respond(await request.json(), FAIL_DOMAINS)
    return JSONResponse(payload, status_code=status)
