from __future__ import annotations

from fastapi import APIRouter, Depends

from ..config import Settings, get_settings
from ..deps import get_gateway, get_session, get_store, idempotency_key
from ..errors import AppError
from ..schemas import JobCreated, Profile, RetryRequest, SearchJobOut, SearchRequest
from ..services.openai_client import Gateway
from ..services.search import create_job, job_out, start_job
from ..store import Session, Store

router = APIRouter(prefix="/api/search", tags=["search"])


def current_profile(session: Session, profile_id: str, version: int) -> Profile:
    profile = session.confirmed.get(profile_id)
    if profile is None:
        raise AppError("PROFILE_NOT_CONFIRMED", "Confirm your profile before searching.", status=409)
    if profile.version != version:
        raise AppError(
            "PROFILE_VERSION_MISMATCH", "Your profile changed. Confirm the latest version and try again.", status=409
        )
    return profile


@router.post("", response_model=JobCreated, status_code=202)
async def create_search(
    body: SearchRequest,
    session: Session = Depends(get_session),
    store: Store = Depends(get_store),
    gateway: Gateway = Depends(get_gateway),
    settings: Settings = Depends(get_settings),
    key: str | None = Depends(idempotency_key),
) -> JobCreated:
    profile = current_profile(session, body.profile_id, body.profile_version)

    async def produce() -> JobCreated:
        job = create_job(session, profile)
        start_job(job, profile, gateway, settings)
        return JobCreated(job_id=job.id)

    return await store.idempotent(session, "search", key, body.model_dump(), produce)


@router.get("/{job_id}", response_model=SearchJobOut)
async def get_search(job_id: str, session: Session = Depends(get_session), store: Store = Depends(get_store)):
    return job_out(store.job(session, job_id))


@router.post("/{job_id}/cancel", response_model=SearchJobOut)
async def cancel_search(job_id: str, session: Session = Depends(get_session), store: Store = Depends(get_store)):
    job = store.job(session, job_id)
    if not job.terminal:
        job.cancelled = True
        job.status = "cancelled"
        job.current_school_id = None
    return job_out(job)


@router.post("/{job_id}/retry", response_model=JobCreated, status_code=202)
async def retry_search(
    job_id: str,
    body: RetryRequest,
    session: Session = Depends(get_session),
    store: Store = Depends(get_store),
    gateway: Gateway = Depends(get_gateway),
    settings: Settings = Depends(get_settings),
    key: str | None = Depends(idempotency_key),
) -> JobCreated:
    original = store.job(session, job_id)
    if not original.terminal:
        raise AppError("SEARCH_IN_PROGRESS", "Wait for the current search to finish.", status=409)
    failed = {progress.school_id for progress in original.schools if progress.status == "failed"}
    if not set(body.school_ids) <= failed:
        raise AppError("NOT_RETRYABLE", "Only universities that failed can be retried.", status=409)
    profile = current_profile(session, original.profile_id, original.profile_version)

    async def produce() -> JobCreated:
        job = create_job(session, profile, retry_from=original, retry_school_ids=list(body.school_ids))
        start_job(job, profile, gateway, settings)
        return JobCreated(job_id=job.id)

    return await store.idempotent(session, f"retry:{job_id}", key, body.model_dump(), produce)
