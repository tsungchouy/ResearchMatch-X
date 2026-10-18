from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile

from ..deps import get_gateway, get_session
from ..errors import AppError
from ..schemas import ConfirmProfileRequest, Profile
from ..services.openai_client import Gateway
from ..services.profile import MAX_PDF_BYTES, extract_pdf_text, extract_profile, validate_text_input
from ..store import Session

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.post("/extract", response_model=Profile)
async def extract(
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    session: Session = Depends(get_session),
    gateway: Gateway = Depends(get_gateway),
) -> Profile:
    has_file = file is not None and bool(file.filename)
    has_text = text is not None and bool(text.strip())
    if has_file == has_text:
        raise AppError("INVALID_INPUT", "Upload a PDF or paste text — one or the other.", status=422)
    if has_file:
        assert file is not None
        data = await file.read(MAX_PDF_BYTES + 1)
        source_text = extract_pdf_text(data, file.filename, file.content_type)
    else:
        source_text = validate_text_input(text or "")
    profile = await extract_profile(gateway, source_text)
    session.drafts[profile.id] = profile
    return profile


@router.post("/confirm", response_model=Profile)
async def confirm(body: ConfirmProfileRequest, session: Session = Depends(get_session)) -> Profile:
    if body.id not in session.drafts and body.id not in session.confirmed:
        raise AppError("PROFILE_NOT_FOUND", "This profile is no longer available. Start over.", status=404)
    previous = session.confirmed.get(body.id)
    data = body.model_dump()
    data.update(version=(previous.version + 1) if previous else 1, confirmed=True)
    profile = Profile.model_validate(data)
    session.confirmed[profile.id] = profile
    return profile
