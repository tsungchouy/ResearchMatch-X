from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import get_gateway, get_session, get_store, idempotency_key
from ..errors import AppError
from ..schemas import DraftRequest, EmailDraft
from ..services.draft import generate_draft
from ..services.openai_client import Gateway
from ..store import Session, Store
from .search import current_profile

router = APIRouter(prefix="/api/draft", tags=["draft"])


@router.post("", response_model=EmailDraft)
async def create_draft(
    body: DraftRequest,
    session: Session = Depends(get_session),
    store: Store = Depends(get_store),
    gateway: Gateway = Depends(get_gateway),
    key: str | None = Depends(idempotency_key),
) -> EmailDraft:
    if not body.review_confirmed:
        raise AppError("REVIEW_REQUIRED", "Review the match before preparing outreach.", status=409)
    profile = current_profile(session, body.profile_id, body.profile_version)
    job = store.job(session, body.job_id)
    if job.profile_id != profile.id or job.profile_version != profile.version:
        raise AppError("STALE_SEARCH", "These matches are from an older profile. Search again.", status=409)
    candidate = next((cand for cand in job.candidates if cand.id == body.candidate_id), None)
    if candidate is None:
        raise AppError("CANDIDATE_NOT_FOUND", "This match is no longer available. Choose another match.", status=404)
    known = {exp.id for exp in profile.experiences}
    if not set(body.selected_experience_ids) <= known:
        raise AppError("INVALID_EXPERIENCE", "Some selected experiences are no longer in your profile.", status=409)
    if body.education_only == bool(body.selected_experience_ids):
        raise AppError(
            "INVALID_SELECTION",
            "Choose experiences to include, or use your education and interests only.",
            status=422,
        )

    async def produce() -> EmailDraft:
        return await generate_draft(gateway, profile, candidate, body)

    return await store.idempotent(session, "draft", key, body.model_dump(), produce)
