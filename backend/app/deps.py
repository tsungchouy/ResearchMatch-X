from __future__ import annotations

import re

from fastapi import Depends, Header, Request

from .config import Settings, get_settings
from .errors import AppError, not_configured
from .services.openai_client import Gateway, OpenAIGateway
from .store import Session, Store

SESSION_PATTERN = re.compile(r"^[A-Za-z0-9_-]{32,128}$")


def get_store(request: Request) -> Store:
    return request.app.state.store


def get_session(
    store: Store = Depends(get_store),
    x_session_id: str | None = Header(default=None, alias="X-Session-ID"),
) -> Session:
    if not x_session_id or not SESSION_PATTERN.match(x_session_id):
        raise AppError("SESSION_REQUIRED", "Your session expired. Start over to continue.", status=400)
    return store.session(x_session_id)


def require_live(settings: Settings = Depends(get_settings)) -> Settings:
    if not settings.live_configured:
        raise not_configured()
    return settings


def get_gateway(request: Request, settings: Settings = Depends(require_live)) -> Gateway:
    gateway = getattr(request.app.state, "gateway", None)
    if gateway is None:
        gateway = OpenAIGateway(settings)
        request.app.state.gateway = gateway
    return gateway


def idempotency_key(idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> str | None:
    return idempotency_key
