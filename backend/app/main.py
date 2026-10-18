from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import Settings, get_settings
from .errors import AppError
from .routes import draft, profile, search
from .schemas import Health
from .store import Store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("researchmatch")

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def error_response(request: Request, status: int, code: str, message: str, retryable: bool = False) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None) or uuid.uuid4().hex
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "retryable": retryable, "requestId": request_id}},
        headers={"X-Request-ID": request_id},
    )


def _validation_message(exc: RequestValidationError) -> str:
    for error in exc.errors():
        message = str(error.get("msg", ""))
        if message.startswith("Value error, "):
            return message.removeprefix("Value error, ")
    return "Some details are missing or invalid. Check the form and try again."


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="ResearchMatch API", version="1.0.0")
    app.state.store = Store(ttl_s=settings.session_ttl_s)

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET", "POST"],
            allow_headers=["Content-Type", "X-Session-ID", "Idempotency-Key"],
        )

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request.state.request_id = uuid.uuid4().hex
        response = await call_next(request)
        response.headers.setdefault("X-Request-ID", request.state.request_id)
        return response

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        return error_response(request, exc.status, exc.code, exc.message, exc.retryable)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        return error_response(request, 422, "VALIDATION_ERROR", _validation_message(exc))

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(request: Request, exc: StarletteHTTPException):
        code = "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR"
        message = "Not found." if exc.status_code == 404 else "The request couldn't be completed."
        return error_response(request, exc.status_code, code, message)

    @app.exception_handler(Exception)
    async def unexpected_handler(request: Request, exc: Exception):
        logger.exception("Unhandled error (request %s)", getattr(request.state, "request_id", "-"))
        return error_response(request, 500, "INTERNAL_ERROR", "Something went wrong. Try again.", retryable=True)

    @app.get("/api/health", response_model=Health)
    async def health(current: Settings = Depends(get_settings)) -> Health:
        return Health(status="ok", live_configured=current.live_configured)

    app.include_router(profile.router)
    app.include_router(search.router)
    app.include_router(draft.router)

    if FRONTEND_DIST.is_dir():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str):
            if path.startswith("api/"):
                raise AppError("NOT_FOUND", "Not found.", status=404)
            candidate = (FRONTEND_DIST / path).resolve()
            if path and candidate.is_file() and FRONTEND_DIST in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(FRONTEND_DIST / "index.html")

    return app


app = create_app()
