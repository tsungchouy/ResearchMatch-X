"""Single-process, in-memory session store.

Everything is lost on restart, and nothing is shared between workers. Run uvicorn
with one worker; a multi-instance deployment would need an external store.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from .errors import AppError
from .schemas import Candidate, Profile, SchoolProgress

TERMINAL_STATUSES = {"complete", "partial", "failed", "cancelled"}


@dataclass
class SearchJob:
    id: str
    session_id: str
    profile_id: str
    profile_version: int
    schools: list[SchoolProgress]
    created_at: str
    status: str = "queued"
    current_school_id: str | None = None
    candidates: list[Candidate] = field(default_factory=list)
    candidates_by_school: dict[str, list[Candidate]] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    retrieved_at: str | None = None
    retry_of: str | None = None
    cancelled: bool = False
    task: asyncio.Task | None = None
    provider_log: list[dict[str, Any]] = field(default_factory=list)

    @property
    def terminal(self) -> bool:
        return self.status in TERMINAL_STATUSES


@dataclass
class IdempotentEntry:
    fingerprint: str
    future: asyncio.Future


@dataclass
class Session:
    id: str
    last_access: float
    drafts: dict[str, Profile] = field(default_factory=dict)
    confirmed: dict[str, Profile] = field(default_factory=dict)
    jobs: dict[str, SearchJob] = field(default_factory=dict)
    idempotency: dict[str, IdempotentEntry] = field(default_factory=dict)

    def has_active_job(self) -> bool:
        return any(not job.terminal for job in self.jobs.values())


def fingerprint(payload: Any) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class Store:
    def __init__(self, ttl_s: float, clock: Callable[[], float] = time.monotonic):
        self.ttl_s = ttl_s
        self.clock = clock
        self.sessions: dict[str, Session] = {}

    def session(self, session_id: str) -> Session:
        self.cleanup()
        now = self.clock()
        session = self.sessions.get(session_id)
        if session is None:
            session = Session(id=session_id, last_access=now)
            self.sessions[session_id] = session
        session.last_access = now
        return session

    def cleanup(self) -> None:
        now = self.clock()
        expired = [
            sid
            for sid, session in self.sessions.items()
            if now - session.last_access > self.ttl_s and not session.has_active_job()
        ]
        for sid in expired:
            del self.sessions[sid]

    def job(self, session: Session, job_id: str) -> SearchJob:
        job = session.jobs.get(job_id)
        if job is None:
            raise AppError(
                "JOB_NOT_FOUND",
                "This search is no longer available. Start over to search again.",
                status=404,
            )
        return job

    async def idempotent(
        self,
        session: Session,
        scope: str,
        key: str | None,
        payload: Any,
        produce: Callable[[], Awaitable[Any]],
    ) -> Any:
        """Run `produce` once per (session, scope, key); replay the result for repeats."""
        if not key:
            return await produce()
        if len(key) > 128:
            raise AppError("INVALID_IDEMPOTENCY_KEY", "The request key is too long.", status=400)
        digest = fingerprint(payload)
        full_key = f"{scope}:{key}"
        entry = session.idempotency.get(full_key)
        if entry is not None:
            if entry.fingerprint != digest:
                raise AppError(
                    "IDEMPOTENCY_CONFLICT",
                    "This request key was already used for different details.",
                    status=409,
                )
            return await asyncio.shield(entry.future)
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        session.idempotency[full_key] = IdempotentEntry(digest, future)
        try:
            result = await produce()
        except BaseException as exc:
            session.idempotency.pop(full_key, None)
            future.set_exception(exc)
            future.exception()  # mark retrieved so asyncio doesn't warn
            raise
        future.set_result(result)
        return result
