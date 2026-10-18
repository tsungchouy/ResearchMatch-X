from __future__ import annotations

import io
import logging
import uuid

from pydantic import BaseModel
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from ..errors import AppError
from ..schemas import Experience, Preferences, Profile
from .openai_client import DATA_GUARD, Gateway

logger = logging.getLogger("researchmatch.profile")

MAX_PDF_BYTES = 5 * 1024 * 1024
MAX_PDF_PAGES = 10
MIN_TEXT_CHARS = 100
MAX_TEXT_CHARS = 20_000


class ExtractedExperience(BaseModel):
    title: str
    description: str


class ExtractedProfile(BaseModel):
    name: str | None
    institution: str | None
    degree_year: str | None
    major: str | None
    skills: list[str]
    experiences: list[ExtractedExperience]


EXTRACT_INSTRUCTIONS = f"""You turn a student's resume text into a short structured profile.
{DATA_GUARD}
Rules:
- Only use information that is explicitly present in the text. If a field is missing, return null (or an empty list).
- Never invent schools, degrees, skills, projects or dates.
- Do not include email addresses, phone numbers, street addresses or links anywhere.
- degree_year: degree and class year as written, e.g. "BS, junior" or "BS 2027".
- skills: up to 15 short items (languages, tools, methods).
- experiences: up to 8 research, project, work or teaching items. title is short (e.g. "Research assistant, Vision Lab").
  description is a factual summary of at most 400 characters using the resume's own facts.
"""


def validate_text_input(text: str) -> str:
    cleaned = text.strip()
    if len(cleaned) < MIN_TEXT_CHARS:
        raise AppError(
            "TEXT_TOO_SHORT",
            f"Add a bit more detail — at least {MIN_TEXT_CHARS} characters.",
            status=422,
        )
    if len(cleaned) > MAX_TEXT_CHARS:
        raise AppError(
            "TEXT_TOO_LONG",
            f"Keep your background under {MAX_TEXT_CHARS:,} characters.",
            status=422,
        )
    return cleaned


def extract_pdf_text(data: bytes, filename: str | None, content_type: str | None) -> str:
    name_ok = (filename or "").lower().endswith(".pdf")
    type_ok = content_type in (None, "", "application/pdf", "application/x-pdf", "application/octet-stream")
    if not name_ok or not type_ok:
        raise AppError("INVALID_FILE_TYPE", "Choose a PDF file.", status=422)
    if len(data) > MAX_PDF_BYTES:
        raise AppError("FILE_TOO_LARGE", "This PDF is larger than 5 MB.", status=422)
    if not data.startswith(b"%PDF"):
        raise AppError("INVALID_PDF", "This file doesn't look like a valid PDF.", status=422)
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise AppError("PDF_ENCRYPTED", "This PDF is password-protected. Paste text instead.", status=422)
        if len(reader.pages) > MAX_PDF_PAGES:
            raise AppError("PDF_TOO_MANY_PAGES", "This PDF has more than 10 pages.", status=422)
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
    except AppError:
        raise
    except (PdfReadError, ValueError, KeyError, TypeError, OSError) as exc:
        logger.info("PDF parse failed: %s", type(exc).__name__)
        raise AppError("INVALID_PDF", "This PDF couldn't be read. Paste text instead.", status=422) from exc
    text = text.strip()
    if len(text) < MIN_TEXT_CHARS:
        raise AppError(
            "PDF_NO_TEXT",
            "We couldn't find readable text in this PDF. It may be a scanned image. Paste text instead.",
            status=422,
        )
    return text[:MAX_TEXT_CHARS]


def _clean(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value[:limit] if value else None


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


async def extract_profile(gateway: Gateway, text: str) -> Profile:
    extracted = await gateway.structured(
        instructions=EXTRACT_INSTRUCTIONS,
        input=f"<data>\n{text}\n</data>",
        model=ExtractedProfile,
        name="student_profile",
    )
    skills: list[str] = []
    for skill in extracted.skills:
        skill = skill.strip()[:60]
        if skill and skill.lower() not in {s.lower() for s in skills}:
            skills.append(skill)
    experiences = [
        Experience(id=new_id("exp"), title=exp.title.strip()[:120], description=exp.description.strip()[:500])
        for exp in extracted.experiences
        if exp.title.strip()
    ][:8]
    return Profile(
        id=new_id("prof"),
        version=0,
        name=_clean(extracted.name, 120),
        institution=_clean(extracted.institution, 200),
        degree_year=_clean(extracted.degree_year, 120),
        major=_clean(extracted.major, 200),
        skills=skills[:15],
        experiences=experiences,
        preferences=Preferences(),
        confirmed=False,
    )
